import { AssetType } from "@polymarket/bindings/clob";
import { fetchBalanceAllowance, updateBalanceAllowance } from "@polymarket/client/actions";
import type { WalletConfig } from "../config/types.js";
import { fetchWithTimeout } from "../util/fetch.js";
import { getSecureClient } from "./secure-client.js";
import { logError } from "../notify/logger.js";

/** USDC collateral on Polymarket CLOB (Polygon). */
const COLLATERAL_DECIMALS = 6;
/** Outcome tokens use 6 decimal places on CLOB. */
const CONDITIONAL_TOKEN_DECIMALS = 6;

/** Polymarket V2 collateral (pUSD), 1:1 with USDC. */
const PUSD_POLYGON = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
/** Legacy bridged USDC on Polygon — must be wrapped to pUSD for CLOB V2. */
const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
/** CLOB V2 exchange spenders — pUSD must be approved for API trading. */
const PUSD_V2_SPENDERS = [
  "0xE111180000d2663C0091e4f400237545B87B996B",
  "0xe2222d279d744050d28e00520010520000310F59",
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
] as const;
const BALANCE_OF_SELECTOR = "0x70a08231";
const ALLOWANCE_SELECTOR = "0xdd62ed3e";

const DEFAULT_POLYGON_RPCS = [
  process.env.POLYGON_RPC_URL,
  "https://rpc-mainnet.matic.quiknode.pro",
  "https://polygon-bor-rpc.publicnode.com",
].filter((v): v is string => Boolean(v));

export type CollateralSource = "clob" | "chain" | "none";

export interface WalletCollateralSnapshot {
  cashUsd: number | null;
  clobUsd: number | null;
  clobAllowanceUsd: number | null;
  chainUsd: number | null;
  source: CollateralSource;
  /** On-chain pUSD approved for all V2 spenders (CLOB cache may still read $0). */
  pusdAllowancesReady: boolean | null;
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseClobBalance(raw: unknown): number {
  return parseSdkBalanceUsd(raw);
}

/** Max spender allowance from CLOB balance-allowance response. */
export function parseClobAllowanceUsd(
  allowances: Record<string, string | bigint> | undefined
): number {
  if (!allowances) return 0;
  let maxRaw = 0n;
  for (const v of Object.values(allowances)) {
    try {
      const n = typeof v === "bigint" ? v : BigInt(v ?? "0");
      if (n > maxRaw) maxRaw = n;
    } catch {
      /* ignore malformed allowance entry */
    }
  }
  return roundUsd(Number(maxRaw) / 10 ** COLLATERAL_DECIMALS);
}

function parseSdkBalanceUsd(balance: unknown): number {
  try {
    return roundUsd(Number(BigInt(String(balance ?? "0"))) / 10 ** COLLATERAL_DECIMALS);
  } catch {
    return 0;
  }
}

function parseConditionalAllowanceUsd(
  allowances: Record<string, string | bigint> | undefined
): number {
  return parseClobAllowanceUsd(allowances);
}

function encodeBalanceOfCall(walletAddress: string): string {
  const addr = walletAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return `${BALANCE_OF_SELECTOR}${addr}`;
}

function encodeAllowanceCall(owner: string, spender: string): string {
  const o = owner.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const s = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return `${ALLOWANCE_SELECTOR}${o}${s}`;
}

async function ethCallAllowance(rpcUrl: string, owner: string, spender: string): Promise<bigint> {
  const res = await fetchWithTimeout(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: PUSD_POLYGON, data: encodeAllowanceCall(owner, spender) }, "latest"],
    }),
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (body.error?.message) throw new Error(body.error.message);
  return BigInt(body.result ?? "0x0");
}

/** True when proxy wallet has on-chain pUSD allowance for all CLOB V2 spenders. */
export async function fetchPusdAllowancesReady(walletAddress: string): Promise<boolean | null> {
  let lastError: Error | undefined;
  for (const rpc of DEFAULT_POLYGON_RPCS) {
    try {
      const allowances = await Promise.all(
        PUSD_V2_SPENDERS.map((spender) => ethCallAllowance(rpc, walletAddress, spender))
      );
      return allowances.every((a) => a > 0n);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (lastError) {
    logError("On-chain pUSD allowance fetch failed", { error: lastError.message });
  }
  return null;
}

/** Chain pUSD is usable for Live orders when CLOB cache is stale but on-chain approvals exist. */
export function canTradeWithChainFallback(snap: WalletCollateralSnapshot): boolean {
  return (
    (snap.clobUsd ?? 0) <= 0 &&
    (snap.chainUsd ?? 0) > 0 &&
    snap.pusdAllowancesReady === true
  );
}

export function liveTradeableCashUsd(snap: WalletCollateralSnapshot): number | null {
  if ((snap.clobUsd ?? 0) > 0) return snap.clobUsd;
  if (canTradeWithChainFallback(snap)) return snap.chainUsd;
  return snap.cashUsd;
}

async function ethCallBalance(rpcUrl: string, token: string, walletAddress: string): Promise<number> {
  const res = await fetchWithTimeout(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data: encodeBalanceOfCall(walletAddress) }, "latest"],
    }),
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (body.error?.message) throw new Error(body.error.message);
  if (!body.result) return 0;
  return roundUsd(Number(BigInt(body.result)) / 10 ** COLLATERAL_DECIMALS);
}

/** Read pUSD + USDC.e on the proxy wallet when CLOB cache is stale (common after V2 migration). */
export async function fetchOnChainCollateralUsd(walletAddress: string): Promise<number | null> {
  let lastError: Error | undefined;
  for (const rpc of DEFAULT_POLYGON_RPCS) {
    try {
      const [pUsd, usdcE] = await Promise.all([
        ethCallBalance(rpc, PUSD_POLYGON, walletAddress),
        ethCallBalance(rpc, USDC_E_POLYGON, walletAddress),
      ]);
      return roundUsd(pUsd + usdcE);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (lastError) {
    logError("On-chain collateral fetch failed", { error: lastError.message });
  }
  return null;
}

export async function fetchWalletCollateral(wallet: WalletConfig): Promise<WalletCollateralSnapshot> {
  let clobUsd: number | null = null;
  let clobAllowanceUsd: number | null = null;
  try {
    const client = await getSecureClient(wallet);
    try {
      await updateBalanceAllowance(client, { assetType: AssetType.COLLATERAL });
    } catch {
      /* refresh is best-effort */
    }
    const resp = await fetchBalanceAllowance(client, { assetType: AssetType.COLLATERAL });
    clobUsd = parseClobBalance(resp.balance);
    clobAllowanceUsd = parseClobAllowanceUsd(resp.allowances);
  } catch (e) {
    logError("Wallet USDC collateral fetch failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const chainUsd = await fetchOnChainCollateralUsd(wallet.proxyAddress);
  const pusdAllowancesReady =
    chainUsd !== null && chainUsd > 0 && (clobUsd ?? 0) <= 0
      ? await fetchPusdAllowancesReady(wallet.proxyAddress)
      : null;

  if (clobUsd !== null && clobUsd > 0) {
    return { cashUsd: clobUsd, clobUsd, clobAllowanceUsd, chainUsd, source: "clob", pusdAllowancesReady };
  }
  if (chainUsd !== null && chainUsd > 0) {
    return { cashUsd: chainUsd, clobUsd, clobAllowanceUsd, chainUsd, source: "chain", pusdAllowancesReady };
  }
  if (clobUsd !== null) {
    return {
      cashUsd: clobUsd,
      clobUsd,
      clobAllowanceUsd,
      chainUsd,
      source: clobUsd > 0 ? "clob" : "none",
      pusdAllowancesReady,
    };
  }
  if (chainUsd !== null) {
    return {
      cashUsd: chainUsd,
      clobUsd,
      clobAllowanceUsd,
      chainUsd,
      source: chainUsd > 0 ? "chain" : "none",
      pusdAllowancesReady,
    };
  }
  return { cashUsd: null, clobUsd, clobAllowanceUsd, chainUsd, source: "none", pusdAllowancesReady };
}

export async function fetchWalletCollateralUsdc(wallet: WalletConfig): Promise<number | null> {
  const snap = await fetchWalletCollateral(wallet);
  return snap.cashUsd;
}

export interface LiveBuyCollateralCheck {
  allow: boolean;
  cashUsd: number | null;
  reason?: string;
}

/** Pre-flight CLOB USDC before a live BUY (notional = price × shares). */
export function checkLiveBuyCollateral(
  cashUsd: number | null,
  requiredUsd: number,
  minOrderUsd: number
): LiveBuyCollateralCheck {
  if (cashUsd === null) {
    return { allow: false, cashUsd: null, reason: "USDC balance unavailable (CLOB)" };
  }
  if (cashUsd < minOrderUsd) {
    return {
      allow: false,
      cashUsd,
      reason: `USDC cash $${cashUsd.toFixed(2)} below min order $${minOrderUsd.toFixed(2)}`,
    };
  }
  if (cashUsd + 0.01 < requiredUsd) {
    return {
      allow: false,
      cashUsd,
      reason: `USDC cash $${cashUsd.toFixed(2)} < need $${requiredUsd.toFixed(2)}`,
    };
  }
  return { allow: true, cashUsd };
}

/** Pre-flight CLOB USDC balance + exchange allowance before a live BUY. */
export function checkLiveBuyCollateralAndAllowance(
  balanceUsd: number | null,
  allowanceUsd: number | null,
  requiredUsd: number,
  minOrderUsd: number
): LiveBuyCollateralCheck {
  const base = checkLiveBuyCollateral(balanceUsd, requiredUsd, minOrderUsd);
  if (!base.allow) return base;

  if (allowanceUsd === null) {
    return { allow: false, cashUsd: balanceUsd, reason: "CLOB allowance unavailable" };
  }
  if (allowanceUsd + 0.01 < requiredUsd) {
    return {
      allow: false,
      cashUsd: balanceUsd,
      reason: `CLOB allowance $${allowanceUsd.toFixed(2)} < need $${requiredUsd.toFixed(2)} — approve on polymarket.com`,
    };
  }
  return base;
}

export interface LiveSellAllowanceCheck {
  allow: boolean;
  reason?: string;
}

/** Pre-flight conditional token balance + allowance before a live SELL. */
export async function checkLiveSellTokenAllowance(
  wallet: WalletConfig,
  tokenId: string,
  requiredShares: number
): Promise<LiveSellAllowanceCheck> {
  try {
    const client = await getSecureClient(wallet);
    try {
      await updateBalanceAllowance(client, {
        assetType: AssetType.CONDITIONAL,
        tokenId,
      });
    } catch {
      /* refresh is best-effort */
    }
    const resp = await fetchBalanceAllowance(client, {
      assetType: AssetType.CONDITIONAL,
      tokenId,
    });
    const balance =
      Math.round(parseSdkBalanceUsd(resp.balance) * 100) / 100;
    const allowance = parseConditionalAllowanceUsd(resp.allowances);

    if (balance + 0.01 < requiredShares) {
      return {
        allow: false,
        reason: `token balance ${balance.toFixed(2)} < need ${requiredShares.toFixed(2)}`,
      };
    }
    if (allowance + 0.01 < requiredShares) {
      return {
        allow: false,
        reason: `token allowance ${allowance.toFixed(2)} < need ${requiredShares.toFixed(2)} — approve on polymarket.com`,
      };
    }
    return { allow: true };
  } catch (e) {
    return {
      allow: false,
      reason: `token allowance check failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export async function fetchWalletTokenBalance(
  wallet: WalletConfig,
  tokenId: string
): Promise<number | null> {
  try {
    const client = await getSecureClient(wallet);
    const resp = await fetchBalanceAllowance(client, {
      assetType: AssetType.CONDITIONAL,
      tokenId,
    });
    const raw = parseSdkBalanceUsd(resp.balance);
    return Math.round(raw * 100) / 100;
  } catch (e) {
    logError("Wallet balance fetch failed", {
      token: tokenId.slice(0, 12),
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Proportional share of on-chain balance allocated to one leader. */
export function proportionalSellable(
  leaderHeld: number,
  walletShares: number,
  totalTracked: number
): number {
  if (leaderHeld <= 0) return 0;
  if (walletShares <= 0) return 0;
  if (totalTracked <= 0) return Math.min(leaderHeld, walletShares);

  const allocated = walletShares * (leaderHeld / totalTracked);
  return Math.round(Math.min(leaderHeld, allocated) * 100) / 100;
}

export interface WalletDrift {
  tokenId: string;
  walletShares: number;
  trackedShares: number;
}

export async function checkWalletDrifts(
  wallet: WalletConfig,
  tokenIds: string[],
  getTrackedShares: (tokenId: string) => number,
  tolerance = 0.02
): Promise<WalletDrift[]> {
  const drifts: WalletDrift[] = [];

  for (const tokenId of tokenIds) {
    const walletShares = await fetchWalletTokenBalance(wallet, tokenId);
    if (walletShares === null) continue;

    const trackedShares = getTrackedShares(tokenId);
    if (Math.abs(walletShares - trackedShares) > tolerance) {
      drifts.push({ tokenId, walletShares, trackedShares });
    }
  }

  return drifts;
}
