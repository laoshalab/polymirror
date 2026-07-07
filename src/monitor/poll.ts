import type { GlobalConfig } from "../config/types.js";
import type { Activity } from "../monitor/data-api.js";
import { getActivity } from "../monitor/data-api.js";
import type { LeaderRegistry } from "../leaders/registry.js";

export interface PollResult {
  leaderId: string;
  fetched: number;
  candidates: Activity[];
  error?: string;
}

export async function pollLeaders(
  registry: LeaderRegistry,
  global: GlobalConfig,
  dataApiUrl?: string
): Promise<PollResult[]> {
  const leaders = registry.enabled();

  const settled = await Promise.allSettled(
    leaders.map(async (leader) => {
      const activities = await getActivity(
        dataApiUrl ?? "",
        {
          user: leader.address!,
          limit: global.activityLimit,
          offset: 0,
          type: global.copyTradesOnly ? "TRADE" : undefined,
          sortBy: "TIMESTAMP",
          sortDirection: "DESC",
        },
        global.execution.networkRetryLimit
      );

      const maxAgeMs = global.maxTradeAgeHours * 3600 * 1000;
      const now = Date.now();
      const candidates = activities.filter((a) => {
        if (a.type !== "TRADE" || !a.asset || !a.side) return false;
        const ts = a.timestamp > 1e12 ? a.timestamp : a.timestamp * 1000;
        if (now - ts > maxAgeMs) return false;
        return (a.size ?? 0) >= 0.01;
      });

      return {
        leaderId: leader.id,
        fetched: activities.length,
        candidates,
      };
    })
  );

  return settled.map((result, i) => {
    const leaderId = leaders[i]!.id;
    if (result.status === "fulfilled") return result.value;
    const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return { leaderId, fetched: 0, candidates: [], error: msg };
  });
}
