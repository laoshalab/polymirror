import { OrderType, OrderSide } from "@polymarket/client";
import { getPublicClient } from "../sdk/public-client.js";

export interface OrderBookMeta {
  tickSize: string;
  negRisk: boolean;
}

export async function fetchOrderBookMeta(
  _clobUrl: string,
  _chainId: number,
  tokenId: string
): Promise<OrderBookMeta | null> {
  void _clobUrl;
  void _chainId;
  try {
    const client = await getPublicClient();
    const book = await client.fetchOrderBook({ tokenId });
    return { tickSize: String(book.tickSize), negRisk: book.negRisk };
  } catch {
    return null;
  }
}

function tickDecimalPlaces(tickSize: number): number {
  if (tickSize >= 0.1) return 1;
  if (tickSize >= 0.01) return 2;
  if (tickSize >= 0.001) return 3;
  return 4;
}

export function roundToTick(value: number, tickSize: number): number {
  if (tickSize <= 0) return value;
  const decimals = tickDecimalPlaces(tickSize);
  const maxPrice = parseFloat((1 - tickSize).toFixed(decimals));
  const ticks = Math.round(value / tickSize);
  const rounded = ticks * tickSize;
  const clamped = Math.max(tickSize, Math.min(maxPrice, rounded));
  return parseFloat(clamped.toFixed(decimals));
}

/** CLOB-safe price string (avoids float artifacts like 0.12300000000000001). */
export function formatPriceForTick(value: number, tickSize: number | string): string {
  const tick = typeof tickSize === "string" ? parseFloat(tickSize) : tickSize;
  if (!Number.isFinite(tick) || tick <= 0) return String(value);
  return roundToTick(value, tick).toFixed(tickDecimalPlaces(tick));
}

export function toOrderType(type: "GTC" | "FAK" | "FOK"): OrderType {
  if (type === "FAK") return OrderType.FAK;
  if (type === "FOK") return OrderType.FOK;
  return OrderType.GTC;
}

export function toSide(side: "BUY" | "SELL"): OrderSide {
  return side === "BUY" ? OrderSide.BUY : OrderSide.SELL;
}

export function toTickSizeArg(tick: string): string {
  const v = tick.trim();
  if (["0.1", "0.01", "0.001", "0.0001"].includes(v)) return v;
  return "0.01";
}

export async function fetchBestExecutablePrice(
  _clobUrl: string,
  _chainId: number,
  tokenId: string,
  side: "BUY" | "SELL"
): Promise<number | null> {
  void _clobUrl;
  void _chainId;
  try {
    const client = await getPublicClient();
    const book = await client.fetchOrderBook({ tokenId });
    if (side === "BUY") {
      const asks = book.asks.map((a) => parseFloat(String(a.price))).filter((p) => p > 0);
      return asks.length ? Math.min(...asks) : null;
    }
    const bids = book.bids.map((b) => parseFloat(String(b.price))).filter((p) => p > 0);
    return bids.length ? Math.max(...bids) : null;
  } catch {
    return null;
  }
}
