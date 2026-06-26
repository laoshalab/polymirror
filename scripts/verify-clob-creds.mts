import "dotenv/config";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { resetSecureClientCache, getSecureClient } from "../src/executor/secure-client.js";

async function main(): Promise<void> {
  resetSecureClientCache();
  const wallet = loadMultiAccountConfig("config.yaml").accounts[0]!.config.wallet;
  const client = await getSecureClient(wallet);
  const match = wallet.apiKey === client.credentials.key;
  console.log("env key adopted:", match);
  if (!match) {
    console.log("env:", wallet.apiKey?.slice(0, 13));
    console.log("active:", client.credentials.key.slice(0, 13));
    process.exit(1);
  }
  await client.fetchClosedOnlyMode();
  console.log("L2 auth OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
