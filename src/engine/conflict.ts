import type { Activity } from "../monitor/data-api.js";
import type { ConflictConfig, LeaderConfig } from "../config/types.js";

export interface ConflictDecision {
  allow: boolean;
  reason?: string;
}

/** In-memory tracker for one poll cycle batch. */
export class ConflictTracker {
  private tokenSide = new Map<string, { leaderId: string; side: "BUY" | "SELL" }>();

  check(
    config: ConflictConfig,
    leaders: Map<string, LeaderConfig>,
    leaderId: string,
    activity: Activity
  ): ConflictDecision {
    if (!activity.asset || !activity.side) return { allow: true };

    const key = activity.asset;
    const existing = this.tokenSide.get(key);

    if (!existing) {
      this.tokenSide.set(key, { leaderId, side: activity.side });
      return { allow: true };
    }

    if (existing.side === activity.side) {
      return { allow: true };
    }

    switch (config.mode) {
      case "skip_both":
        return { allow: false, reason: `conflict skip_both on ${key.slice(0, 10)}` };
      case "net":
        return { allow: true };
      case "priority_leader": {
        const winner = resolvePriority(config.priority, existing.leaderId, leaderId, leaders);
        if (winner !== leaderId) {
          return {
            allow: false,
            reason: `conflict priority: ${winner} wins over ${leaderId}`,
          };
        }
        this.tokenSide.set(key, { leaderId, side: activity.side });
        return { allow: true };
      }
      default:
        return { allow: true };
    }
  }
}

function resolvePriority(
  priority: string[],
  a: string,
  b: string,
  leaders: Map<string, LeaderConfig>
): string {
  if (priority.length) {
    const ia = priority.indexOf(a);
    const ib = priority.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia <= ib ? a : b;
    if (ia >= 0) return a;
    if (ib >= 0) return b;
  }
  const wa = leaders.get(a)?.weight ?? 1;
  const wb = leaders.get(b)?.weight ?? 1;
  return wa >= wb ? a : b;
}
