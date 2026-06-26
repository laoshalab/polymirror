import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { aggregateTrades } from "../src/engine/aggregate.js";
import type { Activity } from "../src/monitor/data-api.js";

function act(ts: number, size: number, price: number): Activity {
  return {
    type: "TRADE",
    asset: "tok1",
    side: "BUY",
    size,
    price,
    timestamp: ts,
  };
}

describe("aggregateTrades", () => {
  it("passes through when window is 0", () => {
    const items = [{ leaderId: "a", activity: act(1000, 10, 0.5) }];
    const out = aggregateTrades(items, 0);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceCount).toBe(1);
  });

  it("merges same leader/token/side within window", () => {
    const items = [
      { leaderId: "a", activity: act(2001, 10, 0.5) },
      { leaderId: "a", activity: act(2000, 20, 0.6) },
    ];
    const out = aggregateTrades(items, 5000);
    expect(out).toHaveLength(1);
    expect(out[0]!.activity.size).toBe(30);
    expect(out[0]!.sourceCount).toBe(2);
    expect(out[0]!.sourceTradeKeys).toHaveLength(2);
  });

  it("does not merge outside window", () => {
    const items = [
      { leaderId: "a", activity: act(10000, 10, 0.5) },
      { leaderId: "a", activity: act(1000, 20, 0.6) },
    ];
    const out = aggregateTrades(items, 1000);
    expect(out).toHaveLength(2);
  });
});
