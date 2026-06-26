import { describe, it, expect } from "vitest";
import { passActivityFilters } from "../src/engine/filters.js";
import type { LeaderConfig } from "../src/config/types.js";
import type { Activity } from "../src/monitor/data-api.js";

const baseLeader: LeaderConfig = {
  id: "x",
  address: "0x1",
  enabled: true,
  weight: 1,
  strategy: { type: "PERCENTAGE", copySize: 10 },
  filters: {
    minPrice: 0.1,
    maxPrice: 0.9,
    sides: ["BUY"],
    marketsBlocklist: ["sports"],
  },
};

function act(overrides: Partial<Activity> = {}): Activity {
  return {
    type: "TRADE",
    asset: "t",
    side: "BUY",
    size: 1,
    price: 0.5,
    timestamp: 1,
    slug: "election-2024",
    ...overrides,
  };
}

describe("passActivityFilters", () => {
  it("passes valid trade", () => {
    expect(passActivityFilters(baseLeader, act()).pass).toBe(true);
  });

  it("rejects low price", () => {
    expect(passActivityFilters(baseLeader, act({ price: 0.05 })).pass).toBe(false);
  });

  it("rejects blocked market", () => {
    expect(passActivityFilters(baseLeader, act({ slug: "nba-sports-final" })).pass).toBe(false);
  });
});
