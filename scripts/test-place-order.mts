import "dotenv/config";
import { OrderSide } from "@polymarket/client";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { getSecureClient } from "../src/executor/secure-client.js";
import { fetchOrderBookMeta, formatPriceForTick } from "../src/executor/orderbook.js";

import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";

async function main(): Promise<void> {
  await ensureUndiciGlobalProxy();
  const tokenId = process.argv[2] ?? "128957136349";
  const multi = loadMultiAccountConfig("config.yaml");
  const wallet = (multi.accounts.find((a) => a.enabled) ?? multi.accounts[0]!).config.wallet;
  const client = await getSecureClient(wallet);
  const meta = await fetchOrderBookMeta(wallet.clobUrl, wallet.chainId, tokenId);
  const price = meta ? formatPriceForTick(0.01, meta.tickSize) : "0.010";
  console.log("Placing test GTC BUY", { tokenId: tokenId.slice(0, 12), price, size: 5, meta: meta?.tickSize ?? "default" });
  const resp = await client.placeLimitOrder({
    tokenId,
    price,
    size: 5,
    side: OrderSide.BUY,
  });
  console.log(JSON.stringify(resp, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
