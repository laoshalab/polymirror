import "dotenv/config";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { fetchGeoblockStatus, formatGeoblockMessage } from "../src/executor/geoblock.js";

async function main(): Promise<void> {
  loadMultiAccountConfig("config.yaml");
  const geo = await fetchGeoblockStatus();
  if (!geo) {
    console.error("Geoblock check failed (network/proxy). Configure proxy in config.yaml.");
    process.exit(1);
  }
  console.log(JSON.stringify(geo, null, 2));
  if (geo.blocked) {
    console.error(formatGeoblockMessage(geo));
    process.exit(2);
  }
  console.log("Geoblock check passed — CLOB trading allowed for this exit IP.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
