import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StateStore } from "../src/state/store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resetSettlementCache } from "../src/engine/settlement.js";
import type { GlobalConfig } from "../src/config/types.js";
import type { LeaderConfig } from "../src/config/types.js";
import { LeaderRegistry } from "../src/leaders/registry.js";

const globalBase: GlobalConfig = {
  pollIntervalMs: 5000,
  activityLimit: 100,
  previewMode: true,
  copyTradesOnly: true,
  maxTradeAgeHours: 24,
  buyDedupWindowMs: 60000,
  tradeAggregationWindowMs: 0,
  healthPort: 0,
  risk: {
    enableCopyTrading: true,
    dailyLossCapPct: 20,
    startingCapitalUsd: 500,
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
    networkRetryLimit: 0,
    gtcFillTimeoutMs: 10000,
    pendingOrderMaxAgeHours: 48,
    autoRedeemOnChain: true,
  },
  conflict: { mode: "priority_leader", priority: [] },
  notify: {
    telegramOnCopy: false,
    telegramOnError: false,
    telegramOnKillSwitch: false,
  },
  proxy: { mode: "none", staticUrl: "", dynamicUrl: "", dynamicRotateSession: true },
};

const liveGlobalBase: GlobalConfig = {
  ...globalBase,
  previewMode: false,
  execution: { ...globalBase.execution, autoRedeemOnChain: true },
};

const leader: LeaderConfig = {
  id: "whale",
  enabled: true,
  address: "0xleader",
  strategy: { type: "PERCENTAGE", copySize: 10 },
};

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-settle-"));
  store = new StateStore(join(dir, "test.db"));
  resetSettlementCache();
  vi.resetModules();
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("processSettlements", () => {
  it("copies leader REDEEM into local settlement", async () => {
    store.ensurePreviewCash(500);
    store.applyCopyFill("whale", "token-a", "BUY", 10, 0.5);
    store.adjustPreviewCash(-5);

    vi.doMock("../src/monitor/data-api.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/monitor/data-api.js")>();
      return {
        ...actual,
        getActivity: vi.fn(async () => [
          {
            type: "REDEEM",
            asset: "token-a",
            size: 20,
            usdcSize: 20,
            timestamp: Date.now() / 1000,
            transactionHash: "0xredeem",
          },
        ]),
      };
    });

    const { processSettlements } = await import("../src/engine/settlement.js");
    const registry = new LeaderRegistry([leader]);
    const result = await processSettlements(registry, globalBase, store, true);

    expect(result.leaderRedeems).toBe(1);
    expect(store.getPosition("whale", "token-a")).toBe(0);
    expect(store.getPreviewCashUsd()).toBe(505);
  });

  it("live leader REDEEM keeps local position when on-chain redeem fails", async () => {
    store.applyCopyFill("whale", "token-a", "BUY", 10, 0.5);

    vi.doMock("../src/monitor/data-api.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/monitor/data-api.js")>();
      return {
        ...actual,
        getActivity: vi.fn(async () => [
          {
            type: "REDEEM",
            asset: "token-a",
            size: 20,
            usdcSize: 20,
            conditionId: "0xcondition",
            timestamp: Date.now() / 1000,
            transactionHash: "0xredeem",
          },
        ]),
      };
    });

    vi.doMock("../src/executor/redeem.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/executor/redeem.js")>();
      return {
        ...actual,
        listRedeemablePositions: vi.fn(async () => []),
        redeemConditionOnChain: vi.fn(async () => ({
          ok: false,
          conditionId: "0xcondition",
          error: "relayer rejected",
          benignFailure: false,
        })),
      };
    });

    const liveGlobal = liveGlobalBase;
    const { processSettlements } = await import("../src/engine/settlement.js");
    const registry = new LeaderRegistry([leader]);
    const wallet = {
      privateKey: "0x" + "1".repeat(64),
      proxyAddress: "0x" + "2".repeat(40),
      signatureType: 0 as const,
      chainId: 137,
      clobUrl: "https://clob.polymarket.com",
      tradingBackend: "secure" as const,
    };

    const result = await processSettlements(registry, liveGlobal, store, false, { wallet });

    expect(result.leaderRedeems).toBe(0);
    expect(store.getPosition("whale", "token-a")).toBe(10);
    expect(store.hasSeen("0xredeem:token-a:REDEEM")).toBe(false);
    expect(result.errors.some((e) => e.includes("relayer rejected"))).toBe(true);
  });

  it("live leader REDEEM clears local position after on-chain redeem succeeds", async () => {
    store.applyCopyFill("whale", "token-a", "BUY", 10, 0.5);

    vi.doMock("../src/monitor/data-api.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/monitor/data-api.js")>();
      return {
        ...actual,
        getActivity: vi.fn(async () => [
          {
            type: "REDEEM",
            asset: "token-a",
            size: 20,
            usdcSize: 20,
            conditionId: "0xcondition",
            timestamp: Date.now() / 1000,
            transactionHash: "0xredeem2",
          },
        ]),
      };
    });

    vi.doMock("../src/executor/redeem.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/executor/redeem.js")>();
      return {
        ...actual,
        listRedeemablePositions: vi.fn(async () => []),
        redeemConditionOnChain: vi.fn(async () => ({
          ok: true,
          conditionId: "0xcondition",
          txHash: "0xabc",
        })),
      };
    });

    const liveGlobal = liveGlobalBase;
    const { processSettlements } = await import("../src/engine/settlement.js");
    const registry = new LeaderRegistry([leader]);
    const wallet = {
      privateKey: "0x" + "1".repeat(64),
      proxyAddress: "0x" + "2".repeat(40),
      signatureType: 0 as const,
      chainId: 137,
      clobUrl: "https://clob.polymarket.com",
      tradingBackend: "secure" as const,
    };

    const result = await processSettlements(registry, liveGlobal, store, false, { wallet });

    expect(result.leaderRedeems).toBe(1);
    expect(store.getPosition("whale", "token-a")).toBe(0);
    expect(store.hasSeen("0xredeem2:token-a:REDEEM")).toBe(true);
  });

  it("live gamma settle keeps local position when earlier chain redeem failed in same cycle", async () => {
    store.applyCopyFill("whale", "token-a", "BUY", 10, 0.5);

    vi.doMock("../src/monitor/data-api.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/monitor/data-api.js")>();
      return {
        ...actual,
        getActivity: vi.fn(async () => []),
      };
    });

    let redeemCalls = 0;
    vi.doMock("../src/executor/redeem.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/executor/redeem.js")>();
      return {
        ...actual,
        listRedeemablePositions: vi.fn(async () => [
          {
            conditionId: "0xcondition",
            tokenId: "token-a",
            size: 10,
            payoutPerShare: 1,
          },
        ]),
        redeemConditionOnChain: vi.fn(async () => {
          redeemCalls++;
          return {
            ok: false,
            conditionId: "0xcondition",
            error: "relayer rejected",
            benignFailure: false,
          };
        }),
      };
    });

    vi.doMock("../src/util/fetch.js", () => ({
      fetchJsonWithRetry: vi.fn(async () => [
        {
          closed: true,
          conditionId: "0xcondition",
          tokens: [{ token_id: "token-a", winner: true }],
        },
      ]),
    }));

    const { processSettlements, resetSettlementCache } = await import("../src/engine/settlement.js");
    resetSettlementCache();
    const registry = new LeaderRegistry([leader]);
    const wallet = {
      privateKey: "0x" + "1".repeat(64),
      proxyAddress: "0x" + "2".repeat(40),
      signatureType: 0 as const,
      chainId: 137,
      clobUrl: "https://clob.polymarket.com",
      tradingBackend: "secure" as const,
    };

    const result = await processSettlements(registry, liveGlobalBase, store, false, { wallet });

    expect(redeemCalls).toBe(1);
    expect(result.autoSettled).toBe(0);
    expect(store.getPosition("whale", "token-a")).toBe(10);
    expect(result.errors.some((e) => e.includes("relayer rejected"))).toBe(true);
  });

  it("live leader REDEEM keeps local position when scan redeem failed earlier in same cycle", async () => {
    store.applyCopyFill("whale", "token-a", "BUY", 10, 0.5);

    vi.doMock("../src/monitor/data-api.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/monitor/data-api.js")>();
      return {
        ...actual,
        getActivity: vi.fn(async () => [
          {
            type: "REDEEM",
            asset: "token-a",
            size: 20,
            usdcSize: 20,
            conditionId: "0xcondition",
            timestamp: Date.now() / 1000,
            transactionHash: "0xredeem-scan-fail",
          },
        ]),
      };
    });

    let redeemCalls = 0;
    vi.doMock("../src/executor/redeem.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/executor/redeem.js")>();
      return {
        ...actual,
        listRedeemablePositions: vi.fn(async () => [
          {
            conditionId: "0xcondition",
            tokenId: "token-a",
            size: 10,
            payoutPerShare: 1,
          },
        ]),
        redeemConditionOnChain: vi.fn(async () => {
          redeemCalls++;
          return {
            ok: false,
            conditionId: "0xcondition",
            error: "relayer rejected",
            benignFailure: false,
          };
        }),
      };
    });

    const { processSettlements, resetSettlementCache } = await import("../src/engine/settlement.js");
    resetSettlementCache();
    const registry = new LeaderRegistry([leader]);
    const wallet = {
      privateKey: "0x" + "1".repeat(64),
      proxyAddress: "0x" + "2".repeat(40),
      signatureType: 0 as const,
      chainId: 137,
      clobUrl: "https://clob.polymarket.com",
      tradingBackend: "secure" as const,
    };

    const result = await processSettlements(registry, liveGlobalBase, store, false, { wallet });

    expect(redeemCalls).toBe(1);
    expect(result.leaderRedeems).toBe(0);
    expect(result.onChainRedeems).toBe(0);
    expect(store.getPosition("whale", "token-a")).toBe(10);
    expect(store.hasSeen("0xredeem-scan-fail:token-a:REDEEM")).toBe(false);
    expect(result.errors.some((e) => e.includes("relayer rejected"))).toBe(true);
  });
});
