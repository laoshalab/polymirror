import "dotenv/config";
import { Wallet } from "ethers";
import { buildHmacSignature, createPublicClient } from "@polymarket/client";
import { createOrDeriveApiKey } from "@polymarket/client/actions";
import { signerFrom } from "@polymarket/client/ethers-v5";
import { expectEvmSignature } from "@polymarket/types";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";

function createApiKeyAuthTypedData(address: string, chainId: number, nonce: number, timestamp: number) {
  return {
    domain: { chainId, name: "ClobAuthDomain", version: "1" },
    message: {
      address,
      message: "This message attests that I control the given wallet",
      nonce,
      timestamp: String(timestamp),
    },
    primaryType: "ClobAuth" as const,
    types: {
      ClobAuth: [
        { name: "address", type: "address" },
        { name: "timestamp", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "message", type: "string" },
      ],
    },
  };
}

async function probeL2(
  polyAddress: string,
  creds: { key: string; secret: string; passphrase: string },
  label: string
): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);
  const path = "/auth/api-keys";
  const sig = await buildHmacSignature(creds.secret, ts, "GET", path);
  const res = await fetch(`https://clob.polymarket.com${path}`, {
    headers: {
      POLY_ADDRESS: polyAddress,
      POLY_API_KEY: creds.key,
      POLY_PASSPHRASE: creds.passphrase,
      POLY_SIGNATURE: sig,
      POLY_TIMESTAMP: String(ts),
    },
  });
  const body = await res.text();
  console.log(label, "key", creds.key.slice(0, 13), "addr", polyAddress.slice(0, 10), "→", res.status, body.slice(0, 120));
}

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  await ensureUndiciGlobalProxy();
  const wallet = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;
  const eoa = new Wallet(wallet.privateKey);
  const eoaAddr = eoa.address;

  const userCreds = {
    key: wallet.apiKey!,
    secret: wallet.apiSecret!,
    passphrase: wallet.apiPassphrase!,
  };

  console.log("=== User-provided credentials ===");
  await probeL2(eoaAddr, userCreds, "user+EOA");

  console.log("\n=== Auto-derived credentials (EOA L1) ===");
  const signer = signerFrom(eoa as Parameters<typeof signerFrom>[0]);
  const ts = Math.floor(Date.now() / 1000);
  const typed = createApiKeyAuthTypedData(eoaAddr, 137, 0, ts);
  const l1Sig = await eoa._signTypedData(typed.domain, typed.types, typed.message);
  const derived = await createOrDeriveApiKey(createPublicClient(), {
    address: eoaAddr,
    nonce: 0,
    signature: expectEvmSignature(l1Sig),
    timestamp: ts,
  });
  await probeL2(eoaAddr, derived, "derived+EOA");
  console.log("derived key:", derived.key);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
