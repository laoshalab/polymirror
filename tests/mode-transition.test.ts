import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateStore } from "../src/state/store.js";
import {
  flushLivePendingBeforePreview,
  migratePreviewToLiveDb,
  countLivePendingOrders,
} from "../src/engine/mode-transition.js";
import { isPreviewOrderId } from "../src/engine/pending-orders.js";
import { resolveAccountDbPath } from "../src/state/db-path.js";
import type { RuntimeConfig } from "../src/config/types.js";
import { existsSync } from "node:fs";

const mockGetOrderStatus = vi.fn();
const mockCancelOrder = vi.fn();

vi.mock("../src/executor/clob.js", () => ({
  ClobExecutor: class {
    getOrderStatus = mockGetOrderStatus;
    cancelOrder = mockCancelOrder;
  },
}));

let dir: string;
let store: StateStore;

function minimalConfig(previewMode: boolean, enableCopy = true): RuntimeConfig {
  return {
    wallet: {
      privateKey: "0x" + "1".repeat(64),
      proxyAddress: "0x" + "2".repeat(40),
      clobUrl: "https://clob.polymarket.com",
      chainId: 137,
      dataApiUrl: "https://data-api.polymarket.com",
      signatureType: 0,
      tradingBackend: "secure",
    },
    app: {
      global: {
        previewMode,
        pollIntervalMs: 5000,
        activityLimit: 100,
        copyTradesOnly: true,
        maxTradeAgeHours: 1,
        buyDedupWindowMs: 60_000,
        tradeAggregationWindowMs: 0,
        healthPort: 8080,
        risk: {
          enableCopyTrading: enableCopy,
          dailyLossCapPct: 20,
          startingCapitalUsd: 500,
          maxDailyVolumeUsd: 500,
          maxOpenMarkets: 15,
          maxOrderUsd: 25,
          minOrderUsd: 1,
          slippageTolerance: 0.03,
          maxPositionPerTokenUsd: 0,
          syncWalletBalance: false,
        },
        execution: {
          orderType: "GTC",
          retryLimit: 3,
          networkRetryLimit: 3,
          gtcFillTimeoutMs: 10_000,
          pendingOrderMaxAgeHours: 48,
          autoRedeemOnChain: true,
        },
        conflict: { mode: "priority_leader", priority: [] },
        notify: {
          telegramOnCopy: false,
          telegramOnError: false,
          telegramOnKillSwitch: false,
        },
      },
      leaders: [],
    },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-mode-"));
  store = new StateStore(join(dir, "live.db"));
  mockGetOrderStatus.mockReset();
  mockCancelOrder.mockReset();
  mockCancelOrder.mockResolvedValue({ ok: true });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("isPreviewOrderId", () => {
  it("detects preview fake order ids", () => {
    expect(isPreviewOrderId("preview-abc-123")).toBe(true);
    expect(isPreviewOrderId("0xclob-order")).toBe(false);
  });
});

describe("countLivePendingOrders", () => {
  it("ignores preview-only pending rows", () => {
    store.upsertPendingOrder({
      orderId: "preview-tok-1",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      size: 10,
      filledShares: 0,
      tradeKey: "k1",
      reasoning: "preview",
    });
    store.upsertPendingOrder({
      orderId: "clob-order-1",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      size: 10,
      filledShares: 0,
      tradeKey: "k2",
      reasoning: "live",
    });
    expect(countLivePendingOrders(store)).toBe(1);
  });
});

describe("flushLivePendingBeforePreview", () => {
  it("no-ops in preview mode", async () => {
    const result = await flushLivePendingBeforePreview(minimalConfig(true), store);
    expect(result.resolved).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it("reconciles live pending before leaving live mode", async () => {
    store.upsertPendingOrder({
      orderId: "ord-done",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      size: 10,
      filledShares: 0,
      tradeKey: "k-done",
      reasoning: "10%",
    });
    mockGetOrderStatus.mockResolvedValue({
      kind: "ok",
      status: {
        sizeMatched: 10,
        originalSize: 10,
        status: "MATCHED",
        terminal: true,
      },
    });

    const result = await flushLivePendingBeforePreview(minimalConfig(false), store);
    expect(result.resolved).toBe(1);
    expect(result.remaining).toBe(0);
    expect(store.countPendingOrders()).toBe(0);
  });
});

describe("migratePreviewToLiveDb", () => {
  it("copies preview dedup keys and positions into live db", () => {
    const previewDir = mkdtempSync(join(tmpdir(), "pm-preview-"));
    const previewStore = new StateStore(join(previewDir, "preview.db"));
    const livePath = resolveAccountDbPath("testacct", false);
    if (existsSync(livePath)) rmSync(livePath, { force: true });
    const suffix = String(Date.now());
    try {
      previewStore.markSeen(`trade-key-1-${suffix}`, "whale");
      previewStore.markSeen(`trade-key-2-${suffix}`, "whale");
      previewStore.applyCopyFill("swisstony", "tok-preview-1", "BUY", 10, 0.5);

      const migration = migratePreviewToLiveDb("testacct", previewStore);
      expect(migration.seenImported).toBe(2);
      expect(migration.positionsImported).toBe(1);

      const liveStore = new StateStore(livePath);
      try {
        expect(liveStore.hasSeen(`trade-key-1-${suffix}`)).toBe(true);
        expect(liveStore.getPosition("swisstony", "tok-preview-1")).toBe(10);
      } finally {
        liveStore.close();
      }
    } finally {
      previewStore.close();
      rmSync(previewDir, { recursive: true, force: true });
      if (existsSync(livePath)) rmSync(livePath, { force: true });
      const liveDir = join(livePath, "..");
      if (existsSync(liveDir)) rmSync(liveDir, { recursive: true, force: true });
    }
  });

  it("importSeenTradesFrom is idempotent", () => {
    store.markSeen("dup-key", "a");
    const other = new StateStore(join(dir, "other.db"));
    try {
      other.markSeen("dup-key", "a");
      other.markSeen("new-key", "b");
      expect(store.importSeenTradesFrom(other)).toBe(1);
      expect(store.hasSeen("new-key")).toBe(true);
    } finally {
      other.close();
    }
  });
});
