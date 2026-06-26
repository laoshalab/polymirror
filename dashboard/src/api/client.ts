const TOKEN_KEY = "polymirror_dashboard_token";
const ACCOUNT_KEY = "polymirror_active_account";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getActiveAccountId(): string | null {
  return sessionStorage.getItem(ACCOUNT_KEY);
}

export function setActiveAccountId(id: string): void {
  sessionStorage.setItem(ACCOUNT_KEY, id);
}

/** Prefix API path with active account scope. Discover/auth stay global. */
export function accountApi(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized.startsWith("/api/discover") ||
    normalized.startsWith("/api/auth") ||
    normalized === "/api/accounts" ||
    normalized.startsWith("/api/leaders/validate") ||
    normalized === "/api/config/reload" ||
    normalized === "/api/settings/proxy/test" ||
    normalized === "/api/settings/telegram"
  ) {
    return normalized;
  }
  const accountId = getActiveAccountId();
  if (!accountId) return normalized;
  if (normalized.startsWith("/api/accounts/")) return normalized;
  const suffix = normalized.replace(/^\/api/, "") || "";
  return `/api/accounts/${encodeURIComponent(accountId)}${suffix}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = accountApi(path);
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    if (text) {
      try {
        const err = JSON.parse(text) as {
          error?: string;
          details?: { message: string }[];
        };
        const detail = err.details?.map((d) => d.message).join("; ");
        throw new Error(detail || err.error || `HTTP ${res.status}`);
      } catch (e) {
        if (e instanceof Error && e.message !== text) throw e;
      }
    }
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface AccountSummary {
  id: string;
  label: string;
  enabled: boolean;
  walletAddress: string;
  walletEnv: string | null;
  previewMode: boolean;
  dbPath: string;
  killSwitchActive: boolean;
  enabledLeaders: string[];
  lastPollAt: number | null;
  lastPoll: {
    fetched: number;
    copied: number;
    skipped: number;
    pendingFilled: number;
    errors: string[];
  } | null;
  todayVolumeUsd: number;
  todayCopyCount: number;
  pendingOrders: number;
}

export interface AccountsResponse {
  accounts: AccountSummary[];
  defaultAccountId: string;
}

export interface StatusResponse {
  version: string;
  accountId: string;
  accountLabel: string;
  status: string;
  uptimeSec: number;
  previewMode: boolean;
  copyTradingEnabled: boolean;
  killSwitchActive: boolean;
  lastPollAt: number | null;
  lastPoll: {
    fetched: number;
    copied: number;
    skipped: number;
    pendingFilled: number;
    errors: string[];
  } | null;
  enabledLeaders: string[];
  lastError: string | null;
  pendingOrders: number;
  walletDrifts: string[];
  dbPath: string;
  accounts?: AccountSummary[];
}

export interface DailyStatsResponse {
  accountId: string;
  today: {
    date: string;
    volumeUsd: number;
    realizedPnl: number;
    copyCount: number;
    killSwitch: number;
  };
  leaders: { leaderId: string; volumeUsd: number }[];
}

export interface LeaderRow {
  id: string;
  address?: string;
  username?: string;
  enabled: boolean;
  weight: number;
  strategy: { type: string; copySize: number };
  limits?: { maxOrderUsd?: number; maxPositionUsd?: number; maxDailyVolumeUsd?: number };
  filters?: { minPrice?: number; maxPrice?: number; sides?: string[] };
  todayVolumeUsd: number;
}

export interface AuditRow {
  id: number;
  ts: number;
  leaderId: string | null;
  action: string;
  tokenId: string | null;
  side: string | null;
  size: number | null;
  price: number | null;
  reason: string | null;
  preview: boolean;
}

export interface PositionRow {
  leaderId: string;
  tokenId: string;
  shares: number;
  avgEntryPrice: number;
}

export interface PendingOrderRow {
  orderId: string;
  leaderId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  filledShares: number;
  tradeKey: string;
  reasoning: string;
  createdAt: number;
  updatedAt: number;
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  return apiFetch<AccountsResponse>("/api/accounts");
}
