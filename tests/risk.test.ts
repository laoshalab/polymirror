import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RiskGate } from "../src/engine/risk.js";
import { StateStore } from "../src/state/store.js";
import type { GlobalConfig } from "../src/config/types.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const globalBase: GlobalConfig = {
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
    dailyLossCapPct: 10,
    startingCapitalUsd: 100,
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
    autoRedeemOnChain: true,
  },
  conflict: { mode: "priority_leader", priority: [] },
  notify: {
    telegramOnCopy: true,
    telegramOnError: true,
    telegramOnKillSwitch: true,
  },
};

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-risk-"));
  store = new StateStore(join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("RiskGate daily loss cap", () => {
  it("triggers kill switch when loss exceeds cap", () => {
    store.addRealizedPnl(-15);
    const risk = new RiskGate(globalBase, store);
    const result = risk.checkDailyLossCap();
    expect(result.allow).toBe(false);
    expect(store.isKillSwitchActive()).toBe(true);
  });

  it("allows trading when loss under cap", () => {
    store.addRealizedPnl(-5);
    const risk = new RiskGate(globalBase, store);
    expect(risk.checkDailyLossCap().allow).toBe(true);
  });
});

describe("RiskGate token exposure cap", () => {
  it("blocks BUY when combined token exposure exceeds cap", () => {
    const global = {
      ...globalBase,
      risk: { ...globalBase.risk, maxPositionPerTokenUsd: 100 },
    };
    store.applyCopyFill("a", "token-x", "BUY", 100, 0.5);
    const risk = new RiskGate(global, store);
    const result = risk.canAddTokenExposure("token-x", 60, 0.5);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain("token exposure");
  });

  it("allows BUY when cap is disabled (0)", () => {
    store.applyCopyFill("a", "token-x", "BUY", 100, 0.5);
    const risk = new RiskGate(globalBase, store);
    expect(risk.canAddTokenExposure("token-x", 1000, 0.5).allow).toBe(true);
  });
});

describe("RiskGate daily volume cap", () => {
  it("blocks BUY when global daily volume exceeded", () => {
    store.addDailyVolume(1999);
    const risk = new RiskGate(globalBase, store);
    expect(risk.canSpendUsd("whale", 5, "BUY").allow).toBe(false);
  });

  it("allows SELL even when daily BUY volume is at cap", () => {
    store.addDailyVolume(2000);
    const risk = new RiskGate(globalBase, store);
    expect(risk.canSpendUsd("whale", 50, "SELL").allow).toBe(true);
  });
});

describe("RiskGate preview cash", () => {
  it("blocks BUY when preview cash insufficient", () => {
    store.ensurePreviewCash(100);
    store.adjustPreviewCash(-95);
    const risk = new RiskGate(globalBase, store);
    expect(risk.canAffordPreviewBuy(10, 100).allow).toBe(false);
  });
});
