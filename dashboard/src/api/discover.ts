export type DiscoverCategory =
  | "OVERALL"
  | "POLITICS"
  | "SPORTS"
  | "CRYPTO"
  | "CULTURE"
  | "FINANCE"
  | "TECH";

export type DiscoverTimePeriod = "DAY" | "WEEK" | "MONTH" | "ALL";
export type DiscoverOrderBy = "PNL" | "VOL";

export interface DiscoverTraderRow {
  rank: number;
  proxyWallet: string;
  userName?: string;
  pnl: number;
  vol: number;
  profileImage?: string;
  xUsername?: string;
  suggestedId: string;
  following: boolean;
  followingLeaderId?: string;
  polymarketUrl: string;
}

export interface DiscoverResponse {
  traders: DiscoverTraderRow[];
  cached?: boolean;
  error?: string;
  hint?: string;
  filters?: {
    category: string;
    timePeriod: string;
    orderBy: string;
  };
}

export function discoverQuery(params: {
  category: string;
  timePeriod: string;
  orderBy: string;
  limit?: number;
}): string {
  const qs = new URLSearchParams({
    category: params.category,
    timePeriod: params.timePeriod,
    orderBy: params.orderBy,
    limit: String(params.limit ?? 25),
  });
  return `/api/discover/leaderboard?${qs}`;
}

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}
