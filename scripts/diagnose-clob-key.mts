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

async function l2Get(path: string, polyAddress: string, creds: { key: string; secret: string; passphrase: string }) {
  const ts = Math.floor(Date.now() / 1000);
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
  return { status: res.status, body: await res.text() };
}

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  await ensureUndiciGlobalProxy();
  const wallet = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;
  const eoa = new Wallet(wallet.privateKey);
  const userCreds = {
    key: wallet.apiKey!,
    secret: wallet.apiSecret!,
    passphrase: wallet.apiPassphrase!,
  };

  console.log("User key:", userCreds.key);
  console.log("Secret length:", userCreds.secret.length, "ends with =:", userCreds.secret.endsWith("="));
  console.log("Passphrase length:", userCreds.passphrase.length);
  console.log("");

  for (const [label, addr] of [
    ["EOA", eoa.address],
    ["Deposit", wallet.proxyAddress],
  ] as const) {
    const r = await l2Get("/auth/api-keys", addr, userCreds);
    console.log(`User creds + ${label}:`, r.status, r.body.slice(0, 120));
  }

  const ts = Math.floor(Date.now() / 1000);
  const typed = createApiKeyAuthTypedData(eoa.address, 137, 0, ts);
  const l1Sig = await eoa._signTypedData(typed.domain, typed.types, typed.message);
  const derived = await createOrDeriveApiKey(createPublicClient(), {
    address: eoa.address,
    nonce: 0,
    signature: expectEvmSignature(l1Sig),
    timestamp: ts,
  });

  console.log("");
  console.log("Registered keys (via derived EOA creds):");
  const listed = await l2Get("/auth/api-keys", eoa.address, derived);
  console.log(listed.status, listed.body);
  console.log("User key in list?", listed.body.includes(userCreds.key.slice(0, 8)));

  console.log("");
  console.log("=== Builder header test ===");
  const ts2 = Math.floor(Date.now() / 1000);
  const bsig = await buildHmacSignature(userCreds.secret, ts2, "GET", "/auth/api-keys");
  const builderRes = await fetch("https://clob.polymarket.com/auth/api-keys", {
    headers: {
      POLY_BUILDER_API_KEY: userCreds.key,
      POLY_BUILDER_PASSPHRASE: userCreds.passphrase,
      POLY_BUILDER_SIGNATURE: bsig,
      POLY_BUILDER_TIMESTAMP: String(ts2),
    },
  });
  console.log("Builder headers:", builderRes.status, (await builderRes.text()).slice(0, 120));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
