import { Wallet } from "ethers";
import { createSecureClient, relayerApiKey, type ApiKeyCreds, type SecureClient, type SecureClientOptions } from "@polymarket/client";
import { signerFrom } from "@polymarket/client/ethers-v5";
import type { WalletConfig } from "../config/types.js";
import { fetchPusdAllowancesReady } from "./balance.js";
import {
  fetchRelayerWalletDeployed,
  registerRelayerDeployedWallet,
} from "./relayer-wallet.js";
import { deriveDepositWalletClobCredentials } from "./deposit-wallet-clob-auth.js";
import { logInfo, logError } from "../notify/logger.js";
import { ensureUndiciGlobalProxy } from "../util/proxy.js";

// Keyed per wallet so multi-account live runs never reuse another wallet's
// SecureClient / approval state (cacheKey includes proxyAddress + creds + mode).
const clientByKey = new Map<string, Promise<SecureClient>>();
const tradingReadyByKey = new Map<string, Promise<void>>();
const approvalsReadyByKey = new Map<string, boolean>();

function cacheKey(wallet: WalletConfig): string {
  return [
    wallet.proxyAddress,
    wallet.apiKey ?? "",
    wallet.relayerApiKey ?? "",
    wallet.relayerApiKeyAddress ?? "",
    secureWalletMode(wallet),
  ].join(":");
}

/**
 * auto = SDK-derived deposit wallet (SecureClient default).
 * settings = pass POLYMARKET_ADDRESS (relayer-deployed wallets supported via SDK patch).
 */
function secureWalletMode(wallet: WalletConfig): "auto" | "settings" {
  const raw = (process.env.POLYMARKET_SECURE_WALLET ?? "").trim().toLowerCase();
  if (raw === "auto") return "auto";
  if (raw === "settings") return "settings";
  const eoa = new Wallet(wallet.privateKey).address.toLowerCase();
  return wallet.proxyAddress.toLowerCase() !== eoa ? "settings" : "auto";
}

async function onChainApprovalsReady(wallet: WalletConfig): Promise<boolean> {
  const key = cacheKey(wallet);
  const cached = approvalsReadyByKey.get(key);
  if (cached !== undefined) return cached;
  const ready = (await fetchPusdAllowancesReady(wallet.proxyAddress)) === true;
  approvalsReadyByKey.set(key, ready);
  return ready;
}

function relayerAuthHint(): string {
  return (
    "Regenerate Relayer API key in Polymarket Settings (Developer) while logged in with your trading wallet. " +
    "Copy the new UUID into RELAYER_API_KEY and the address shown next to it into RELAYER_API_KEY_ADDRESS."
  );
}

async function prepareRelayerDeployedWallet(wallet: WalletConfig, mode: "auto" | "settings"): Promise<void> {
  if (mode !== "settings") return;
  const deployed = await fetchRelayerWalletDeployed(wallet.proxyAddress);
  if (deployed) {
    registerRelayerDeployedWallet(wallet.proxyAddress);
    logInfo("Relayer-deployed deposit wallet registered for SecureClient", {
      wallet: wallet.proxyAddress.slice(0, 10),
    });
    return;
  }
  throw new Error(
    `POLYMARKET_ADDRESS ${wallet.proxyAddress} is not a relayer-deployed wallet and does not match SDK-derived deposit addresses. ` +
      "Use POLYMARKET_SECURE_WALLET=auto for a new SDK wallet, or verify POLYMARKET_ADDRESS in Polymarket Settings."
  );
}

function buildSecureClientOptions(
  signer: ReturnType<typeof signerFrom>,
  wallet: WalletConfig,
  mode: "auto" | "settings",
  hasRelayer: boolean,
  clobCredentials?: ApiKeyCreds
): SecureClientOptions {
  const shared = {
    signer,
    ...(hasRelayer
      ? {
          apiKey: relayerApiKey({
            key: wallet.relayerApiKey!,
            address: wallet.relayerApiKeyAddress!,
          }),
        }
      : {}),
    ...(mode === "settings" ? { wallet: wallet.proxyAddress } : {}),
  };

  if (clobCredentials) {
    return { ...shared, credentials: clobCredentials };
  }
  return shared;
}

export async function getSecureClient(wallet: WalletConfig): Promise<SecureClient> {
  const key = cacheKey(wallet);
  const existing = clientByKey.get(key);
  if (existing) return existing;

  const clientPromise = (async () => {
    await ensureUndiciGlobalProxy();

    const signer = signerFrom(new Wallet(wallet.privateKey) as Parameters<typeof signerFrom>[0]);
    const mode = secureWalletMode(wallet);
    const hasRelayer = Boolean(wallet.relayerApiKey && wallet.relayerApiKeyAddress);

    await prepareRelayerDeployedWallet(wallet, mode);

    const eoa = new Wallet(wallet.privateKey).address.toLowerCase();
    const isDepositWallet =
      mode === "settings" && wallet.proxyAddress.toLowerCase() !== eoa;

    let clobCredentials: ApiKeyCreds | undefined =
      wallet.apiKey && wallet.apiSecret && wallet.apiPassphrase
        ? ({
            key: wallet.apiKey,
            secret: wallet.apiSecret,
            passphrase: wallet.apiPassphrase,
          } as ApiKeyCreds)
        : undefined;

    if (!clobCredentials && isDepositWallet) {
      try {
        clobCredentials = await deriveDepositWalletClobCredentials(
          wallet.privateKey,
          wallet.proxyAddress,
          wallet.chainId
        );
        logInfo("Deposit-wallet CLOB credentials derived", {
          wallet: wallet.proxyAddress.slice(0, 10),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logInfo(
          "Deposit-wallet CLOB credential derivation unavailable — orders may fail until POLYMARKET_API_* is set or Polymarket enables POLY_1271 L1 auth",
          { error: msg.slice(0, 120) }
        );
      }
    }

    const client = await createSecureClient(
      buildSecureClientOptions(signer, wallet, mode, hasRelayer, clobCredentials)
    );

    const accountWallet = client.account.wallet.toLowerCase();
    const configured = wallet.proxyAddress.toLowerCase();
    if (accountWallet !== configured) {
      logInfo("SecureClient wallet differs from POLYMARKET_ADDRESS", {
        configured: wallet.proxyAddress.slice(0, 10),
        active: client.account.wallet.slice(0, 10),
        walletType: client.account.walletType,
        hint: "Funds must be on the active wallet address",
      });
    } else {
      logInfo("SecureClient ready", {
        wallet: client.account.wallet.slice(0, 10),
        walletType: client.account.walletType,
        mode,
        relayer: hasRelayer,
      });
    }

    if (
      wallet.apiKey &&
      client.credentials.key !== wallet.apiKey
    ) {
      logError(
        "POLYMARKET_API_KEY in .env was not adopted — SDK fell back to auto-derived CLOB credentials. " +
          "Regenerate CLOB API key in Polymarket Settings (Developer) for the EOA that signs your private key.",
        {
          configured: wallet.apiKey.slice(0, 13),
          active: client.credentials.key.slice(0, 13),
        }
      );
    }

    return client;
  })();

  clientByKey.set(key, clientPromise);
  // Drop a failed client so the next call can rebuild instead of caching the error.
  clientPromise.catch(() => {
    if (clientByKey.get(key) === clientPromise) clientByKey.delete(key);
  });
  return clientPromise;
}

/** Gasless approvals before first Live copy cycle (skipped when on-chain pUSD already approved). */
export async function ensureTradingReady(wallet: WalletConfig): Promise<void> {
  const key = cacheKey(wallet);
  let ready = tradingReadyByKey.get(key);
  if (!ready) {
    ready = (async () => {
      try {
        if (await onChainApprovalsReady(wallet)) {
          logInfo("On-chain pUSD approvals ready — skipping setupTradingApprovals", {
            wallet: wallet.proxyAddress.slice(0, 10),
          });
          await getSecureClient(wallet);
          return;
        }

        if (!isDepositWalletConfig(wallet)) {
          throw new Error(
            "EOA 模式：交易所授权需由 EOA 自行支付 gas 完成（非 relayer）。\n" +
              "  1) 向 EOA 充值少量 POL 作为 gas；\n" +
              "  2) 在 Polygon 上对 CLOB V2 交易所合约完成 pUSD approve 与 ConditionalTokens setApprovalForAll；\n" +
              "授权完成后本步骤会自动跳过。"
          );
        }

        if (!wallet.relayerApiKey || !wallet.relayerApiKeyAddress) {
          throw new Error("RELAYER_API_KEY required for first-time approval setup. " + relayerAuthHint());
        }

        const client = await getSecureClient(wallet);
        logInfo("Setting up trading approvals (SecureClient)", {
          wallet: client.account.wallet.slice(0, 10),
        });
        await client.setupTradingApprovals();
        approvalsReadyByKey.set(key, true);
        // Force this wallet's client to rebuild so it reflects the new approvals.
        clientByKey.delete(key);
        logInfo("Trading approvals ready", { wallet: client.account.wallet.slice(0, 10) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/invalid authorization|401/i.test(msg)) {
          logError("Relayer API key rejected — " + relayerAuthHint(), { error: msg });
        } else if (/order signer address has to be the address of the api key/i.test(msg)) {
          logError(
            "CLOB API key is bound to your EOA, but POLY_1271 orders sign as the deposit wallet — " +
              "set POLYMARKET_API_KEY/SECRET/PASSPHRASE from Polymarket Settings (Developer) for the trading wallet, " +
              "or track Polymarket/clob-client-v2#65",
            { error: msg }
          );
        } else if (/does not match the signer|deterministic wallet/i.test(msg)) {
          logError(
            "SecureClient wallet classification failed — run: npx tsx scripts/patch-polymarket-client.mts",
            { error: msg }
          );
        } else {
          logError("SecureClient trading setup failed", { error: msg });
        }
        throw e;
      }
    })();
    tradingReadyByKey.set(key, ready);
  }
  return ready;
}

export function resetSecureClientCache(): void {
  clientByKey.clear();
  approvalsReadyByKey.clear();
  tradingReadyByKey.clear();
}

export const DEPOSIT_WALLET_CLOB_KEY_ERROR =
  "Deposit wallet (POLY_1271) orders sign as POLYMARKET_ADDRESS, but CLOB API Key is bound to your EOA. " +
  "Polymarket CLOB currently rejects POLY_1271 L1 API-key registration (Invalid L1 Request headers). " +
  "Workaround: place orders on polymarket.com; track https://github.com/Polymarket/clob-client-v2/issues/65";

function isDepositWalletConfig(wallet: WalletConfig): boolean {
  const eoa = new Wallet(wallet.privateKey).address.toLowerCase();
  return wallet.proxyAddress.toLowerCase() !== eoa;
}

/** Block live orders when deposit wallet lacks a CLOB key bound to the same address. */
export async function assertDepositWalletCanPlaceOrders(wallet: WalletConfig): Promise<void> {
  if (!isDepositWalletConfig(wallet)) return;

  try {
    await deriveDepositWalletClobCredentials(
      wallet.privateKey,
      wallet.proxyAddress,
      wallet.chainId
    );
    return;
  } catch {
    /* CLOB may reject POLY_1271 L1 auth until upstream fix lands */
  }

  const client = await getSecureClient(wallet);
  const eoa = new Wallet(wallet.privateKey).address;
  throw new Error(
    `${DEPOSIT_WALLET_CLOB_KEY_ERROR}\n` +
      `  deposit wallet: ${wallet.proxyAddress}\n` +
      `  EOA (API key):  ${eoa}\n` +
      `  active CLOB key: ${client.credentials.key.slice(0, 13)}…`
  );
}
