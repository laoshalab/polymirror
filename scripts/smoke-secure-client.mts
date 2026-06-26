import "dotenv/config";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { ensureTradingReady, getSecureClient } from "../src/executor/secure-client.js";

async function main(): Promise<void> {
  const multi = loadMultiAccountConfig("config.yaml");
  const account = multi.accounts.find((a) => a.enabled) ?? multi.accounts[0]!;
  const wallet = account.config.wallet;
  console.log("Trading backend:", wallet.tradingBackend);
  console.log("Wallet:", wallet.proxyAddress);
  console.log("Relayer key address:", wallet.relayerApiKeyAddress ?? "(not set)");

  if (wallet.tradingBackend !== "secure") {
    console.error(
      "Expected POLYMARKET_TRADING_BACKEND=secure (deposit wallet accounts auto-select secure when SIGNATURE_TYPE=3)."
    );
    process.exit(1);
  }

  await ensureTradingReady(wallet);
  const client = await getSecureClient(wallet);
  const value = await client.fetchPortfolioValue();
  console.log("Active wallet:", client.account.wallet);
  console.log("Wallet type:", client.account.walletType);
  console.log("Portfolio value:", value);
  console.log("SecureClient smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
