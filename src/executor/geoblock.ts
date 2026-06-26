import { fetchJsonWithRetry } from "../util/fetch.js";
import { getProxyHint, isProxyConfigured } from "../util/proxy.js";

const GEOBLOCK_URL = "https://polymarket.com/api/geoblock";
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface GeoblockStatus {
  blocked: boolean;
  ip: string;
  country: string;
  region: string;
}

let cached: { at: number; status: GeoblockStatus | null } | null = null;

export async function fetchGeoblockStatus(): Promise<GeoblockStatus | null> {
  try {
    const raw = await fetchJsonWithRetry<Record<string, unknown>>(
      GEOBLOCK_URL,
      { headers: { Accept: "application/json" }, timeoutMs: 12_000 },
      1
    );
    return {
      blocked: Boolean(raw.blocked),
      ip: String(raw.ip ?? ""),
      country: String(raw.country ?? ""),
      region: String(raw.region ?? ""),
    };
  } catch {
    return null;
  }
}

export async function getCachedGeoblockStatus(force = false): Promise<GeoblockStatus | null> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.status;
  }
  const status = await fetchGeoblockStatus();
  cached = { at: Date.now(), status };
  return status;
}

export function isGeoblockError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("restricted in your region") ||
    lower.includes("geoblock") ||
    lower.includes("not available in your region")
  );
}

export function formatGeoblockMessage(status: GeoblockStatus): string {
  if (!status.blocked) {
    return `Geoblock passed: IP ${status.ip} (${status.country}/${status.region})`;
  }
  const proxyHint = isProxyConfigured()
    ? "当前代理出口仍被 Polymarket 判定为受限地区，请换美国等允许地区的 residential 代理。"
    : `未配置代理${getProxyHint()}。`;
  return (
    `CLOB 地区限制：IP ${status.ip} (${status.country}/${status.region}) 被 geoblock。` +
    `${proxyHint} 文档：https://docs.polymarket.com/developers/CLOB/geoblock`
  );
}

export function resetGeoblockCache(): void {
  cached = null;
}
