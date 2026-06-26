import type { DiscoverCategory, DiscoverOrderBy, DiscoverTimePeriod } from "./discover-types.js";
import { getPublicClient } from "../sdk/public-client.js";
import { getActivity, type Activity } from "../monitor/data-api.js";

export type { DiscoverCategory, DiscoverOrderBy, DiscoverTimePeriod };

export interface DiscoverTrader {
  rank: number;
  proxyWallet: string;
  userName?: string;
  pnl: number;
  vol: number;
  profileImage?: string;
  xUsername?: string;
}

interface CacheEntry {
  at: number;
  traders: DiscoverTrader[];
}

const CACHE_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(params: Record<string, string | number>): string {
  return JSON.stringify(params);
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeTrader(row: {
  wallet?: string | null;
  rank?: string | null;
  userName?: string | null;
  pnl?: unknown;
  vol?: unknown;
  profileImage?: string | null;
  xUsername?: string | null;
}, index: number): DiscoverTrader | null {
  const proxyWallet = String(row.wallet ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(proxyWallet)) return null;

  return {
    rank: num(row.rank) || index + 1,
    proxyWallet,
    userName: row.userName ?? undefined,
    pnl: num(row.pnl),
    vol: num(row.vol),
    profileImage: row.profileImage ?? undefined,
    xUsername: row.xUsername ?? undefined,
  };
}

export async function fetchDiscoverLeaderboard(options: {
  category?: string;
  timePeriod?: string;
  orderBy?: string;
  limit?: number;
  offset?: number;
}): Promise<{ traders: DiscoverTrader[]; cached: boolean }> {
  const category = (options.category ?? "OVERALL").toUpperCase() as DiscoverCategory;
  const timePeriod = (options.timePeriod ?? "MONTH").toUpperCase() as DiscoverTimePeriod;
  const orderBy = (options.orderBy ?? "PNL").toUpperCase() as DiscoverOrderBy;
  const pageSize = Math.min(50, Math.max(1, options.limit ?? 25));

  const key = cacheKey({ category, timePeriod, orderBy, pageSize, offset: options.offset ?? 0 });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { traders: hit.traders, cached: true };
  }

  const client = await getPublicClient();
  const paginator = client.listTraderLeaderboard({
    category,
    timePeriod,
    orderBy,
    pageSize,
  });
  const page = await paginator.firstPage();
  const traders = page.items
    .map((row, i) => normalizeTrader(row, i))
    .filter((r): r is DiscoverTrader => r !== null);

  cache.set(key, { at: Date.now(), traders });
  return { traders, cached: false };
}

export function suggestLeaderId(userName: string | undefined, address: string): string {
  const fromName = (userName ?? "")
    .replace(/^@/, "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 32);
  if (fromName.length >= 2) return fromName;
  return `trader_${address.slice(2, 10).toLowerCase()}`;
}

export interface TraderActivityItem {
  timestamp: number;
  type: string;
  side?: string;
  size?: number;
  price?: number;
  usdcSize?: number;
  title?: string;
  asset?: string;
  outcome?: string;
}

export interface TraderProfile {
  userName?: string;
  profileImage?: string;
  xUsername?: string;
  bio?: string;
}

export interface TraderDetail {
  address: string;
  profile?: TraderProfile;
  rankStats?: DiscoverTrader;
  recentTrades: TraderActivityItem[];
  tradeCount24h: number;
}

function mapActivityItem(a: Activity): TraderActivityItem {
  return {
    timestamp: a.timestamp,
    type: a.type,
    side: a.side,
    size: a.size,
    price: a.price,
    usdcSize: a.usdcSize,
    title: a.title,
    asset: a.asset,
    outcome: a.outcome,
  };
}

async function fetchTraderActivity(address: string, limit = 40): Promise<TraderActivityItem[]> {
  const rows = await getActivity(
    "",
    {
      user: address,
      limit,
      type: "TRADE",
      sortBy: "TIMESTAMP",
      sortDirection: "DESC",
    },
    2
  );
  return rows.map(mapActivityItem);
}

async function fetchTraderRankStats(address: string): Promise<DiscoverTrader | undefined> {
  const client = await getPublicClient();
  const paginator = client.listTraderLeaderboard({
    user: address,
    timePeriod: "MONTH",
    category: "OVERALL",
    pageSize: 1,
  });
  const page = await paginator.firstPage();
  const row = page.items[0];
  if (!row) return undefined;
  return normalizeTrader(row, 0) ?? undefined;
}

async function fetchSdkProfile(address: string): Promise<TraderProfile | undefined> {
  try {
    const client = await getPublicClient();
    const data = await client.fetchPublicProfile({ address });
    if (!data) return undefined;
    return {
      userName: data.name ?? data.pseudonym ?? undefined,
      profileImage: data.profileImage ?? undefined,
      xUsername: data.xUsername ?? undefined,
      bio: data.bio ?? undefined,
    };
  } catch {
    return undefined;
  }
}

export async function fetchTraderDetail(address: string): Promise<TraderDetail> {
  const normalized = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error("Invalid address");
  }

  const [recentTrades, rankStats, profile] = await Promise.all([
    fetchTraderActivity(normalized),
    fetchTraderRankStats(normalized),
    fetchSdkProfile(normalized),
  ]);

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const tradeCount24h = recentTrades.filter((t) => {
    const ts = t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000;
    return ts >= dayAgo;
  }).length;

  return {
    address: normalized,
    profile: profile ?? (rankStats?.userName
      ? {
          userName: rankStats.userName,
          profileImage: rankStats.profileImage,
          xUsername: rankStats.xUsername,
        }
      : undefined),
    rankStats,
    recentTrades,
    tradeCount24h,
  };
}
