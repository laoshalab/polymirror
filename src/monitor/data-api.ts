import type { Activity as SdkActivity, ClobTradeActivity } from "@polymarket/bindings/data";
import { ActivityType as SdkActivityType } from "@polymarket/bindings/data";
import { getPublicClient } from "../sdk/public-client.js";
import { fetchJsonWithRetry } from "../util/fetch.js";
import { logInfo } from "../notify/logger.js";

const DEFAULT_DATA_API = "https://data-api.polymarket.com";
/** Fresh TTL for activity reads; stale entries are reused on fetch failure. */
export const ACTIVITY_CACHE_TTL_MS = 10_000;

interface ActivityCacheEntry {
  at: number;
  data: Activity[];
}

const activityCache = new Map<string, ActivityCacheEntry>();

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

  if (raw.type !== SdkActivityType.TRADE) {
    if (String(raw.type) === "REDEEM") {
      const redeem = raw as SdkActivity & {
        tokenId?: string;
        shares?: unknown;
        amount?: unknown;
        conditionId?: string;
      };
      const asset = redeem.tokenId ? String(redeem.tokenId) : undefined;
      if (!asset) return base;
      const size = num(redeem.shares);
      const usdcSize = num(redeem.amount);
      return {
        ...base,
        type: "REDEEM",
        asset,
        size,
        usdcSize: usdcSize > 0 ? usdcSize : size,
        conditionId: redeem.conditionId ? String(redeem.conditionId) : undefined,
      };
    }
    return base;
  }

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

export function buildActivityUrl(base: string, params: GetActivityParams): string {
  const root = (base || DEFAULT_DATA_API).replace(/\/$/, "");
  const q = new URLSearchParams({ user: params.user });
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.type) q.set("type", params.type);
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortDirection) q.set("sortDirection", params.sortDirection);
  return `${root}/activity?${q}`;
}

function isComboTradeRaw(raw: Record<string, unknown>): boolean {
  return raw.isCombo === true || raw.outcomeIndex === 999;
}

/** Lenient mapper for raw Data API rows — skips combo trades the SDK cannot normalize. */
export function mapRawActivityItem(raw: Record<string, unknown>): Activity | null {
  const type = String(raw.type ?? "") as ActivityType;
  if (!type) return null;

  const base: Activity = {
    proxyWallet: raw.proxyWallet != null ? String(raw.proxyWallet) : undefined,
    timestamp: num(raw.timestamp),
    transactionHash: raw.transactionHash != null ? String(raw.transactionHash) : undefined,
    type,
  };

  if (type !== "TRADE") {
    if (type === "REDEEM") {
      const asset =
        raw.asset != null && String(raw.asset) !== "" ? String(raw.asset) : undefined;
      if (!asset) return null;
      const size = num(raw.size);
      return {
        ...base,
        type: "REDEEM",
        asset,
        size,
        usdcSize: num(raw.usdcSize ?? raw.size),
        conditionId: raw.conditionId != null ? String(raw.conditionId) : undefined,
        title: raw.title != null ? String(raw.title) : undefined,
        slug: raw.slug != null ? String(raw.slug) : undefined,
      };
    }
    return base;
  }

  if (isComboTradeRaw(raw)) return null;

  const asset =
    raw.asset != null && String(raw.asset) !== "" ? String(raw.asset) : undefined;
  const sideRaw =
    raw.side != null && String(raw.side) !== "" ? String(raw.side) : undefined;
  const side = sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : undefined;
  if (!asset || !side) return null;

  const outcomeIndexRaw = raw.outcomeIndex;
  const outcomeIndex =
    typeof outcomeIndexRaw === "number" &&
    Number.isFinite(outcomeIndexRaw) &&
    outcomeIndexRaw !== 999
      ? outcomeIndexRaw
      : undefined;

  return {
    ...base,
    type: "TRADE",
    size: num(raw.size),
    usdcSize: num(raw.usdcSize ?? raw.size),
    price: num(raw.price),
    asset,
    side,
    conditionId: raw.conditionId != null ? String(raw.conditionId) : undefined,
    outcomeIndex,
    title: raw.title != null ? String(raw.title) : undefined,
    slug: raw.slug != null ? String(raw.slug) : undefined,
    eventSlug: raw.eventSlug != null ? String(raw.eventSlug) : undefined,
    outcome: raw.outcome != null ? String(raw.outcome) : undefined,
  };
}

function isSdkActivityParseError(e: Error): boolean {
  return e instanceof TypeError && /Expected activity\.\w+ to be present/.test(e.message);
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

async function fetchActivityPageRest(
  base: string,
  params: GetActivityParams,
  networkRetryLimit: number
): Promise<Activity[]> {
  const url = buildActivityUrl(base, params);
  const raw = await fetchJsonWithRetry<unknown[]>(url, {}, networkRetryLimit);
  if (!Array.isArray(raw)) return [];

  let items = raw
    .map((row) =>
      row && typeof row === "object"
        ? mapRawActivityItem(row as Record<string, unknown>)
        : null
    )
    .filter((a): a is Activity => a !== null);

  if (params.offset && params.offset > 0) {
    items = items.slice(params.offset);
  }

  return items;
}

function activityCacheKey(base: string, params: GetActivityParams): string {
  return JSON.stringify({
    base,
    user: params.user,
    limit: params.limit,
    offset: params.offset,
    type: params.type,
    sortBy: params.sortBy,
    sortDirection: params.sortDirection,
  });
}

async function fetchActivityUncached(
  base: string,
  params: GetActivityParams,
  networkRetryLimit: number
): Promise<Activity[]> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= networkRetryLimit; attempt++) {
    try {
      return await fetchActivityPage(params);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (isSdkActivityParseError(lastError)) {
        return fetchActivityPageRest(base, params, networkRetryLimit);
      }
      if (attempt < networkRetryLimit && isRetryableActivityError(lastError)) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("getActivity failed");
}

export async function getActivity(
  base: string,
  params: GetActivityParams,
  networkRetryLimit = 0
): Promise<Activity[]> {
  const key = activityCacheKey(base, params);
  const hit = activityCache.get(key);
  const now = Date.now();

  if (hit && now - hit.at < ACTIVITY_CACHE_TTL_MS) {
    return hit.data;
  }

  try {
    const data = await fetchActivityUncached(base, params, networkRetryLimit);
    activityCache.set(key, { at: now, data });
    return data;
  } catch (e) {
    if (hit) {
      const msg = e instanceof Error ? e.message : String(e);
      logInfo("Activity fetch failed — using stale cache", {
        user: params.user.slice(0, 10),
        ageMs: now - hit.at,
        error: msg,
      });
      return hit.data;
    }
    throw e;
  }
}

export function resetActivityCache(): void {
  activityCache.clear();
}

export function tradeEventKey(a: Activity): string {
  const tx = a.transactionHash ?? "";
  const asset = a.asset ?? "";
  const side = a.side ?? "";
  const ts = a.timestamp ?? 0;
  if (tx) return `${tx}:${asset}:${side}`;
  return `:${ts}:${asset}:${side}`;
}

export function redeemEventKey(a: Activity): string {
  const tx = a.transactionHash ?? "";
  const asset = a.asset ?? "";
  const ts = a.timestamp ?? 0;
  if (tx) return `${tx}:${asset}:REDEEM`;
  return `:${ts}:${asset}:REDEEM`;
}
