import { fetchJsonWithRetry } from "../util/fetch.js";

export type PnlRange = "1d" | "1w" | "1m" | "1y" | "ytd" | "all";

export interface PnlPoint {
  ts: number;
  pnl: number;
}

export interface AccountPnlSnapshot {
  accountId: string;
  address: string;
  range: PnlRange;
  rangeLabel: string;
  currentPnl: number;
  periodStartPnl: number;
  change: number;
  points: PnlPoint[];
  engineTodayPnl?: number;
  previewMode?: boolean;
  source: "polymarket" | "engine";
  error?: string;
  hint?: string;
}

const PNL_API = "https://user-pnl-api.polymarket.com/user-pnl";
const LB_PROFIT_API = "https://lb-api.polymarket.com/profit";

const RANGE_LABELS: Record<PnlRange, string> = {
  "1d": "过去 24 小时",
  "1w": "过去 1 周",
  "1m": "过去 1 个月",
  "1y": "过去 1 年",
  ytd: "年初至今",
  all: "全部时间",
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseTimeseries(data: unknown): PnlPoint[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      const tsRaw = row.t ?? row.timestamp ?? row.time ?? row.date;
      const pnlRaw = row.p ?? row.pnl ?? row.value ?? row.profit;
      let ts = num(tsRaw);
      if (ts > 0 && ts < 1e12) ts *= 1000;
      return { ts, pnl: num(pnlRaw) };
    })
    .filter((p) => p.ts > 0)
    .sort((a, b) => a.ts - b.ts);
}

function rangeToApi(range: PnlRange): { interval: string; fidelity: string } {
  switch (range) {
    case "1d":
      return { interval: "1d", fidelity: "1h" };
    case "1w":
      return { interval: "1w", fidelity: "3h" };
    case "1m":
      return { interval: "1m", fidelity: "1d" };
    case "1y":
    case "ytd":
    case "all":
      return { interval: "all", fidelity: "1d" };
  }
}

function rangeToLbWindow(range: PnlRange): string {
  switch (range) {
    case "1d":
      return "1d";
    case "1w":
      return "7d";
    case "1m":
      return "30d";
    default:
      return "all";
  }
}

function filterPointsByRange(points: PnlPoint[], range: PnlRange): PnlPoint[] {
  if (points.length === 0) return points;
  const now = Date.now();
  let cutoff = 0;
  if (range === "1y") {
    cutoff = now - 365 * 86400000;
  } else if (range === "ytd") {
    cutoff = new Date(new Date().getFullYear(), 0, 1).getTime();
  } else {
    return points;
  }
  const filtered = points.filter((p) => p.ts >= cutoff);
  return filtered.length >= 2 ? filtered : points;
}

async function fetchPnlTimeseries(address: string, range: PnlRange): Promise<PnlPoint[]> {
  const { interval, fidelity } = rangeToApi(range);
  const qs = new URLSearchParams({
    user_address: address,
    interval,
    fidelity,
  });
  const data = await fetchJsonWithRetry<unknown>(
    `${PNL_API}?${qs}`,
    { headers: { Accept: "application/json" }, timeoutMs: 25_000 },
    2
  );
  return filterPointsByRange(parseTimeseries(data), range);
}

async function fetchLbProfit(address: string, range: PnlRange): Promise<number | null> {
  if (range === "1y" || range === "ytd") return null;
  const qs = new URLSearchParams({
    address,
    window: rangeToLbWindow(range),
    limit: "1",
  });
  try {
    const data = await fetchJsonWithRetry<unknown>(
      `${LB_PROFIT_API}?${qs}`,
      { headers: { Accept: "application/json" }, timeoutMs: 15_000 },
      1
    );
    if (!Array.isArray(data) || !data[0]) return null;
    const row = data[0] as Record<string, unknown>;
    return num(row.amount ?? row.pnl ?? row.profit ?? row.value);
  } catch {
    return null;
  }
}

function summarizePoints(points: PnlPoint[]): { current: number; change: number; start: number } {
  if (points.length === 0) return { current: 0, change: 0, start: 0 };
  const first = points[0]!.pnl;
  const last = points[points.length - 1]!.pnl;
  return { current: last, change: last - first, start: first };
}

export async function buildAccountPnlSnapshot(options: {
  accountId: string;
  address: string;
  range: PnlRange;
  engineTodayPnl?: number;
  previewMode?: boolean;
}): Promise<AccountPnlSnapshot> {
  const range = options.range;
  const base: AccountPnlSnapshot = {
    accountId: options.accountId,
    address: options.address,
    range,
    rangeLabel: RANGE_LABELS[range],
    currentPnl: 0,
    periodStartPnl: 0,
    change: 0,
    points: [],
    engineTodayPnl: options.engineTodayPnl,
    previewMode: options.previewMode,
    source: "polymarket",
  };

  try {
    const [points, lbProfit] = await Promise.all([
      fetchPnlTimeseries(options.address, range),
      fetchLbProfit(options.address, range),
    ]);

    const summary = summarizePoints(points);
    base.points = points;
    base.periodStartPnl = summary.start;
    base.currentPnl = lbProfit ?? summary.current;
    base.change =
      lbProfit !== null && points.length >= 2
        ? lbProfit - summary.start
        : summary.change;

    if (points.length === 0 && lbProfit === null) {
      base.currentPnl = 0;
      base.change = 0;
    }
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    base.hint = "无法拉取 Polymarket 盈亏曲线。请在「设置 → 网络」配置代理。";
    if (options.engineTodayPnl !== undefined) {
      base.source = "engine";
      base.currentPnl = options.engineTodayPnl;
      base.change = options.engineTodayPnl;
      base.points = buildEngineFallbackPoints(options.engineTodayPnl);
    }
  }

  return base;
}

/** Flat line when only engine preview PnL is available. */
function buildEngineFallbackPoints(todayPnl: number): PnlPoint[] {
  const now = Date.now();
  const dayAgo = now - 86400000;
  return [
    { ts: dayAgo, pnl: 0 },
    { ts: now, pnl: todayPnl },
  ];
}

export function parsePnlRange(raw: string | null): PnlRange {
  const v = (raw ?? "1d").toLowerCase();
  if (v === "1d" || v === "1w" || v === "1m" || v === "1y" || v === "ytd" || v === "all") return v;
  return "1d";
}
