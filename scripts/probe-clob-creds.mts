import "dotenv/config";
import { Wallet } from "ethers";
import { buildHmacSignature } from "@polymarket/client";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";

async function probe(
  wallet: ReturnType<typeof loadMultiAccountConfig>["accounts"][0]["config"]["wallet"],
  polyAddress: string,
  label: string
): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);
  const method = "GET";
  const path = "/auth/api-keys";
  const sig = await buildHmacSignature(wallet.apiSecret!, ts, method, path);
  const res = await fetch(`https://clob.polymarket.com${path}`, {
    headers: {
      POLY_ADDRESS: polyAddress,
      POLY_API_KEY: wallet.apiKey!,
      POLY_PASSPHRASE: wallet.apiPassphrase!,
      POLY_SIGNATURE: sig,
      POLY_TIMESTAMP: String(ts),
    },
  });
  const body = await res.text();
  console.log(label, polyAddress.slice(0, 10), "→", res.status, body.slice(0, 180));
}

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  await ensureUndiciGlobalProxy();

  const wallet = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;
  const eoa = new Wallet(wallet.privateKey).address;

  console.log("Configured API key:", wallet.apiKey?.slice(0, 13));
  console.log("EOA:", eoa);
  console.log("Deposit:", wallet.proxyAddress);
  console.log("Relayer key addr:", wallet.relayerApiKeyAddress);
  console.log("---");

  for (const [label, addr] of [
    ["EOA", eoa],
    ["Deposit", wallet.proxyAddress],
    ["Relayer", wallet.relayerApiKeyAddress!],
  ] as const) {
    await probe(wallet, addr, label);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
