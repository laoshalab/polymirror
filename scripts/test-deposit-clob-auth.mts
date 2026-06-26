import "dotenv/config";
import { Wallet } from "ethers";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { deriveDepositWalletClobCredentials } from "../src/executor/deposit-wallet-clob-auth.js";

async function main(): Promise<void> {
  const multi = loadMultiAccountConfig("config.yaml");
  const account = multi.accounts.find((a) => a.enabled) ?? multi.accounts[0]!;
  const wallet = account.config.wallet;
  const eoa = new Wallet(wallet.privateKey).address;
  console.log("EOA:", eoa);
  console.log("Deposit wallet:", wallet.proxyAddress);
  try {
    const creds = await deriveDepositWalletClobCredentials(
      wallet.privateKey,
      wallet.proxyAddress
    );
    console.log("CLOB credentials derived for deposit wallet");
    console.log("API key (prefix):", creds.key.slice(0, 8) + "…");
  } catch (e) {
    console.error("Deposit-wallet CLOB auth failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
