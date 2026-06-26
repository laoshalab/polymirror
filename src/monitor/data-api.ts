import type { Activity as SdkActivity, ClobTradeActivity } from "@polymarket/bindings/data";
import { ActivityType as SdkActivityType } from "@polymarket/bindings/data";
import { getPublicClient } from "../sdk/public-client.js";

export type ActivityType =
  | "TRADE"
  | "SPLIT"
  | "MERGE"
  | "REDEEM"
  | "REWARD"
  | "CONVERSION"
  | "MAKER_REBATE";

export interface Activity {
  proxyWallet?: string;
  timestamp: number;
  conditionId?: string;
  type: ActivityType;
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
  price?: number;
  asset?: string;
  side?: "BUY" | "SELL";
  outcomeIndex?: number;
  title?: string;
  slug?: string;
  eventSlug?: string;
  outcome?: string;
}

export interface GetActivityParams {
  user: string;
  limit?: number;
  offset?: number;
  type?: ActivityType;
  sortBy?: "TIMESTAMP" | "TOKENS" | "CASH";
  sortDirection?: "ASC" | "DESC";
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapSdkActivity(raw: SdkActivity): Activity {
  const base: Activity = {
    proxyWallet: "wallet" in raw ? String(raw.wallet ?? "") : undefined,
    timestamp: Number(raw.timestamp ?? 0),
    transactionHash: raw.transactionHash ? String(raw.transactionHash) : undefined,
    type: String(raw.type) as ActivityType,
  };

  if (raw.type !== SdkActivityType.TRADE) return base;

  const trade = raw as ClobTradeActivity;
  return {
    ...base,
    type: "TRADE",
    size: num(trade.shares),
    usdcSize: num(trade.amount),
    price: num(trade.price),
    asset: trade.tokenId ? String(trade.tokenId) : undefined,
    side: trade.side as "BUY" | "SELL",
    conditionId: trade.conditionId ? String(trade.conditionId) : undefined,
    outcomeIndex: trade.outcomeIndex ?? undefined,
    title: trade.title ?? undefined,
    slug: trade.slug ?? undefined,
    eventSlug: trade.eventSlug ?? undefined,
    outcome: trade.outcome ?? undefined,
  };
}

/** @deprecated base URL ignored — uses @polymarket/client listActivity */
export function buildActivityUrl(base: string, params: GetActivityParams): string {
  void base;
  return `sdk:listActivity?user=${params.user}`;
}

function isRetryableActivityError(e: Error): boolean {
  if (e.name === "TimeoutError") return true;
  return /timed out|fetch failed|transport/i.test(e.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchActivityPage(params: GetActivityParams): Promise<Activity[]> {
  const client = await getPublicClient();
  const pageSize = Math.min(500, params.limit ?? 100);
  const paginator = client.listActivity({
    user: params.user,
    pageSize,
    ...(params.type ? { type: [params.type as SdkActivityType] } : {}),
    ...(params.sortBy ? { sortBy: params.sortBy } : {}),
    ...(params.sortDirection ? { sortDirection: params.sortDirection } : {}),
  });

  const first = await paginator.firstPage();
  let items = first.items.map(mapSdkActivity);

  if (params.offset && params.offset > 0) {
    items = items.slice(params.offset);
  }

  return items;
}

export async function getActivity(
  _base: string,
  params: GetActivityParams,
  networkRetryLimit = 0
): Promise<Activity[]> {
  void _base;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= networkRetryLimit; attempt++) {
    try {
      return await fetchActivityPage(params);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < networkRetryLimit && isRetryableActivityError(lastError)) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("getActivity failed");
}

export function tradeEventKey(a: Activity): string {
  const tx = a.transactionHash ?? "";
  const asset = a.asset ?? "";
  const side = a.side ?? "";
  const ts = a.timestamp ?? 0;
  if (tx) return `${tx}:${asset}:${side}`;
  return `:${ts}:${asset}:${side}`;
}
