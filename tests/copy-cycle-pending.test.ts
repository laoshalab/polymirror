import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateStore } from "../src/state/store.js";
import { runCopyCycle } from "../src/engine/copy-cycle.js";
import type { RuntimeConfig } from "../src/config/types.js";

vi.mock("../src/monitor/poll.js", () => ({
  pollLeaders: vi.fn(async () => []),
}));

const mockGetOrderStatus = vi.fn();
const mockCancelOrder = vi.fn();

vi.mock("../src/executor/clob.js", () => ({
  ClobExecutor: class {
    getOrderStatus = mockGetOrderStatus;
    cancelOrder = mockCancelOrder;
    listOpenOrders = vi.fn(async () => []);
    placeLimitOrder = vi.fn();
    recoverOrderAfterFailure = vi.fn(async () => null);
  },
  isDefiniteOrderRejection: () => false,
}));

vi.mock("../src/executor/orderbook.js", () => ({
  fetchBestExecutablePrice: vi.fn(async () => 0.5),
}));

let dir: string;
let store: StateStore;

function liveConfig(enableCopy: boolean): RuntimeConfig {
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
        previewMode: false,
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
  dir = mkdtempSync(join(tmpdir(), "pm-cycle-"));
  store = new StateStore(join(dir, "test.db"));
  mockGetOrderStatus.mockReset();
  mockCancelOrder.mockReset();
  mockCancelOrder.mockResolvedValue({ ok: true });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runCopyCycle pending reconciliation", () => {
  it("reconciles pending even when copy trading is disabled", async () => {
    store.upsertPendingOrder({
      orderId: "ord-live-1",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      size: 10,
      filledShares: 0,
      tradeKey: "k1",
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

    const result = await runCopyCycle(liveConfig(false), store);
    expect(result.pendingFilled).toBe(1);
    expect(result.copied).toBe(0);
    expect(store.countPendingOrders()).toBe(0);
    expect(result.errors.some((e) => e.includes("copy trading disabled"))).toBe(true);
  });
});
