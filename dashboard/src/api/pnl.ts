import { apiGet } from "./leaders";

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

export const PNL_RANGE_IDS: PnlRange[] = ["1d", "1w", "1m", "1y", "ytd", "all"];

export function fetchAccountPnl(range: PnlRange) {
  return apiGet<AccountPnlSnapshot>(`/api/pnl?range=${encodeURIComponent(range)}`);
}
