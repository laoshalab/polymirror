import type { Activity } from "../monitor/data-api.js";
import { tradeEventKey } from "../monitor/data-api.js";
import type { StateStore } from "../state/store.js";

export function isAlreadyProcessed(store: StateStore, activity: Activity): boolean {
  return store.hasSeen(tradeEventKey(activity));
}

export function isAnyTradeKeySeen(store: StateStore, tradeKeys: string[]): boolean {
  return tradeKeys.some((key) => store.hasSeen(key));
}

export function isRecentBuyDuplicate(
  store: StateStore,
  leaderId: string,
  activity: Activity,
  windowMs: number
): boolean {
  if (activity.side !== "BUY" || !activity.asset) return false;
  return store.hasRecentBuy(leaderId, activity.asset, windowMs);
}
