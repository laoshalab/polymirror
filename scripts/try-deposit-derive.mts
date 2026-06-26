import "dotenv/config";
import { buildHmacSignature } from "@polymarket/client";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { deriveDepositWalletClobCredentials } from "../src/executor/deposit-wallet-clob-auth.js";
import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";

async function l2(
  path: string,
  addr: string,
  creds: { key: string; secret: string; passphrase: string }
): Promise<{ status: number; body: string }> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await buildHmacSignature(creds.secret, ts, "GET", path);
  const res = await fetch(`https://clob.polymarket.com${path}`, {
    headers: {
      POLY_ADDRESS: addr,
      POLY_API_KEY: creds.key,
      POLY_PASSPHRASE: creds.passphrase,
      POLY_SIGNATURE: sig,
      POLY_TIMESTAMP: String(ts),
    },
  });
  return { status: res.status, body: await res.text() };
}

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  await ensureUndiciGlobalProxy();
  const w = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;

  console.log("Trying deposit-wallet L1 derive...");
  try {
    const derived = await deriveDepositWalletClobCredentials(w.privateKey, w.proxyAddress);
    console.log("Derived deposit key:", derived.key);
    const list = await l2("/auth/api-keys", w.proxyAddress, derived);
    console.log("L2 list (deposit addr):", list.status, list.body);
    const mode = await l2("/auth/ban-status/closed-only", w.proxyAddress, derived);
    console.log("closed-only:", mode.status, mode.body.slice(0, 120));
  } catch (e) {
    console.error("Deposit derive failed:", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
