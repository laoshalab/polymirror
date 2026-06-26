import { describe, it, expect } from "vitest";
import { ConflictTracker } from "../src/engine/conflict.js";
import type { LeaderConfig } from "../src/config/types.js";
import type { Activity } from "../src/monitor/data-api.js";

const leaders = new Map<string, LeaderConfig>([
  ["a", { id: "a", address: "0x1", enabled: true, weight: 2, strategy: { type: "PERCENTAGE", copySize: 10 } }],
  ["b", { id: "b", address: "0x2", enabled: true, weight: 1, strategy: { type: "PERCENTAGE", copySize: 10 } }],
]);

function act(side: "BUY" | "SELL"): Activity {
  return { type: "TRADE", asset: "token-x", side, size: 10, price: 0.5, timestamp: 1 };
}

describe("ConflictTracker", () => {
  it("skip_both blocks opposing sides", () => {
    const t = new ConflictTracker();
    expect(t.check({ mode: "skip_both", priority: [] }, leaders, "a", act("BUY")).allow).toBe(true);
    expect(t.check({ mode: "skip_both", priority: [] }, leaders, "b", act("SELL")).allow).toBe(false);
  });

  it("priority_leader favors higher weight", () => {
    const t = new ConflictTracker();
    t.check({ mode: "priority_leader", priority: [] }, leaders, "a", act("BUY"));
    const d = t.check({ mode: "priority_leader", priority: [] }, leaders, "b", act("SELL"));
    expect(d.allow).toBe(false);
    expect(d.reason).toContain("a wins");
  });
});
