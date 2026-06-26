import type { LeaderConfig } from "../config/types.js";
import type { Activity } from "../monitor/data-api.js";

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function passActivityFilters(leader: LeaderConfig, activity: Activity): FilterResult {
  const price = activity.price ?? 0;
  const filters = leader.filters;
  if (!filters) return { pass: true };

  if (filters.minPrice !== undefined && price < filters.minPrice) {
    return { pass: false, reason: `price ${price} < min ${filters.minPrice}` };
  }
  if (filters.maxPrice !== undefined && price > filters.maxPrice) {
    return { pass: false, reason: `price ${price} > max ${filters.maxPrice}` };
  }
  if (filters.sides && activity.side && !filters.sides.includes(activity.side)) {
    return { pass: false, reason: `side ${activity.side} not allowed` };
  }

  const slug = (activity.slug ?? activity.eventSlug ?? activity.title ?? "").toLowerCase();
  if (filters.marketsBlocklist?.length) {
    for (const blocked of filters.marketsBlocklist) {
      if (slug.includes(blocked.toLowerCase())) {
        return { pass: false, reason: `blocked market keyword ${blocked}` };
      }
    }
  }
  if (filters.marketsAllowlist?.length) {
    const allowed = filters.marketsAllowlist.some((k) => slug.includes(k.toLowerCase()));
    if (!allowed) return { pass: false, reason: "not in allowlist" };
  }

  return { pass: true };
}
