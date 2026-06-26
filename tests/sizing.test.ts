import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { calculateOrderSize, parseTieredMultipliers } from "../src/engine/sizing.js";
import { StateStore } from "../src/state/store.js";
import type { GlobalConfig, LeaderConfig } from "../src/config/types.js";
import type { Activity } from "../src/monitor/data-api.js";

const global: GlobalConfig = {
  pollIntervalMs: 5000,
  activityLimit: 100,
  previewMode: true,
  copyTradesOnly: true,
  maxTradeAgeHours: 1,
  buyDedupWindowMs: 60000,
  tradeAggregationWindowMs: 0,
  healthPort: 0,
  risk: {
    enableCopyTrading: true,
    dailyLossCapPct: 20,
    startingCapitalUsd: 1000,
    maxDailyVolumeUsd: 2000,
    maxOpenMarkets: 30,
    maxOrderUsd: 50,
    minOrderUsd: 1,
    slippageTolerance: 0.03,
    maxPositionPerTokenUsd: 0,
    syncWalletBalance: true,
  },
  execution: {
    orderType: "GTC",
    retryLimit: 3,
    networkRetryLimit: 3,
    gtcFillTimeoutMs: 10000,
    pendingOrderMaxAgeHours: 48,
  },
  conflict: { mode: "priority_leader", priority: [] },
  notify: {
    telegramOnCopy: true,
    telegramOnError: true,
    telegramOnKillSwitch: true,
  },
};

function leader(overrides: Partial<LeaderConfig> = {}): LeaderConfig {
  return {
    id: "whale",
    address: "0x0000000000000000000000000000000000000001",
    enabled: true,
    weight: 1,
    strategy: { type: "PERCENTAGE", copySize: 10 },
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    type: "TRADE",
    asset: "token123",
    side: "BUY",
    size: 100,
    price: 0.5,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("parseTieredMultipliers", () => {
  it("parses ranges and plus suffix", () => {
    const tiers = parseTieredMultipliers("0-100:1,100-500:0.5,500+:0.25")!;
    expect(tiers).toHaveLength(3);
    expect(tiers[0]!.multiplier).toBe(1);
    expect(tiers[2]!.max).toBeNull();
  });
});

describe("calculateOrderSize", () => {
  it("applies PERCENTAGE sizing", () => {
    const r = calculateOrderSize(leader(), global, activity({ size: 100, price: 0.5 }));
    expect(r.belowMinimum).toBe(false);
    expect(r.finalUsd).toBeCloseTo(5, 1);
  });

  it("caps at max order usd", () => {
    const r = calculateOrderSize(
      leader({ limits: { maxOrderUsd: 3 } }),
      global,
      activity({ size: 1000, price: 0.5 })
    );
    expect(r.finalUsd).toBeLessThanOrEqual(3.01);
  });

  it("returns belowMinimum under min order", () => {
    const r = calculateOrderSize(
      leader({ strategy: { type: "PERCENTAGE", copySize: 0.1 } }),
      global,
      activity({ size: 1, price: 0.1 })
    );
    expect(r.belowMinimum).toBe(true);
  });
});

describe("calculateOrderSize position cap basis", () => {
  let dir: string;
  let store: StateStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pm-sizing-"));
    store = new StateStore(join(dir, "test.db"));
    // 200 shares bought at 0.5 → cost basis $100, mark-to-market at 0.9 = $180.
    store.applyCopyFill("whale", "token123", "BUY", 200, 0.5);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const capLeader = leader({ limits: { maxPositionUsd: 150 } });
  const priceUp = activity({ side: "BUY", size: 1000, price: 0.9 });

  it("market basis blocks when mark-to-market exceeds cap", () => {
    const marketGlobal: GlobalConfig = {
      ...global,
      risk: { ...global.risk, positionCapBasis: "market" },
    };
    const r = calculateOrderSize(capLeader, marketGlobal, priceUp, store);
    expect(r.belowMinimum).toBe(true);
    expect(r.reasoning).toContain("max position reached");
  });

  it("cost basis allows buy when capital deployed is under cap", () => {
    const costGlobal: GlobalConfig = {
      ...global,
      risk: { ...global.risk, positionCapBasis: "cost" },
    };
    const r = calculateOrderSize(capLeader, costGlobal, priceUp, store);
    expect(r.belowMinimum).toBe(false);
    // cost room = 150 - 100 = $50; global max_order_usd also caps at $50.
    expect(r.finalUsd).toBeLessThanOrEqual(50.01);
    expect(r.finalUsd).toBeGreaterThan(0);
  });

  it("defaults to market basis when unset", () => {
    const r = calculateOrderSize(capLeader, global, priceUp, store);
    expect(r.belowMinimum).toBe(true);
  });
});
