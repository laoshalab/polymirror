import "dotenv/config";
import { Wallet } from "ethers";
import { createPublicClient, production } from "@polymarket/client";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  await ensureUndiciGlobalProxy();
  const w = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;
  const eoa = new Wallet(w.privateKey).address;

  const pub = createPublicClient({ environment: production });
  // Replicate Bi(): derive default deposit wallet for signer
  const signerAddr = eoa;
  const rpc = pub.rpc;

  // Call internal derivation via beginAuthentication prep — use exported wallet helpers if any
  const deployedUrl = `${production.relayer}/deployed?address=${w.proxyAddress}&type=WALLET`;
  const configuredDeployed = await fetch(deployedUrl).then((r) => r.json());
  const derivedCheck = await fetch(
    `${production.relayer}/deployed?address=${w.proxyAddress}&type=WALLET`
  ).then((r) => r.json());

  console.log("EOA:", eoa);
  console.log("POLYMARKET_ADDRESS:", w.proxyAddress);
  console.log("relayer deployed (configured):", configuredDeployed);

  // Try auto createSecureClient to capture derived wallet from error message
  const { createSecureClient, relayerApiKey } = await import("@polymarket/client");
  const { signerFrom } = await import("@polymarket/client/ethers-v5");
  const signer = signerFrom(new Wallet(w.privateKey) as Parameters<typeof signerFrom>[0]);
  const relayer = relayerApiKey({
    key: w.relayerApiKey!,
    address: w.relayerApiKeyAddress!,
  });

  try {
    const c = await createSecureClient({ signer, apiKey: relayer });
    console.log("AUTO wallet:", c.account.wallet, c.account.walletType);
    console.log("matches POLY?", c.account.wallet.toLowerCase() === w.proxyAddress.toLowerCase());
  } catch (e) {
    console.log("AUTO error:", e instanceof Error ? e.message : e);
  }

  try {
    const c = await createSecureClient({ signer, apiKey: relayer, wallet: w.proxyAddress });
    console.log("SETTINGS wallet:", c.account.wallet);
  } catch (e) {
    console.log("SETTINGS error:", e instanceof Error ? e.message : e);
  }
}

main().catch(console.error);
