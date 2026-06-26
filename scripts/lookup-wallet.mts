import "dotenv/config";
import { Wallet } from "ethers";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { fetchRelayerWalletDeployed } from "../src/executor/relayer-wallet.js";
import { fetchWalletCollateral } from "../src/executor/balance.js";
import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";
import { getPublicClient } from "../src/sdk/public-client.js";

async function gammaProfile(label: string, address: string): Promise<void> {
  const url = `https://gamma-api.polymarket.com/public-profile?address=${address}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await res.text();
  console.log(`${label} gamma (${res.status}):`, body.slice(0, 300));
}

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  await ensureUndiciGlobalProxy();

  const wallet = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;
  const eoa = new Wallet(wallet.privateKey).address;
  const deposit = wallet.proxyAddress;

  console.log("=== Your wallets ===");
  console.log("EOA (MetaMask):     ", eoa);
  console.log("Deposit (POLYMARKET_ADDRESS):", deposit);
  console.log("");

  console.log("=== On-chain / API status ===");
  console.log("Relayer deployed:", await fetchRelayerWalletDeployed(deposit));
  const collateral = await fetchWalletCollateral(deposit);
  console.log("Collateral:", JSON.stringify(collateral));

  const pub = await getPublicClient();
  const portfolio = await pub.fetchPortfolioValue({ user: deposit });
  console.log("Portfolio value:", JSON.stringify(portfolio));

  console.log("");
  console.log("=== Polymarket profile lookup ===");
  await gammaProfile("EOA", eoa);
  await gammaProfile("Deposit", deposit);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
