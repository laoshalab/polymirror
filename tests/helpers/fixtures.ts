import type { Activity } from "../src/monitor/data-api.js";
import { POLYMARKET_BUILDER_CODE } from "../src/config/builder.js";
import type { LeaderConfig, RuntimeConfig } from "../src/config/types.js";

export function testActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    type: "TRADE",
    asset: "token-abc123456789",
    side: "BUY",
    size: 100,
    price: 0.5,
    timestamp: Date.now(),
    transactionHash: "0xabc123",
    ...overrides,
  };
}

export function testLeader(overrides: Partial<LeaderConfig> = {}): LeaderConfig {
  return {
    id: "whale",
    address: "0x0000000000000000000000000000000000000001",
    enabled: true,
    weight: 1,
    strategy: { type: "PERCENTAGE", copySize: 10 },
    limits: { maxOrderUsd: 20, maxPositionUsd: 150 },
    filters: { minPrice: 0.05, maxPrice: 0.95, sides: ["BUY", "SELL"] },
    ...overrides,
  };
}

export function previewRuntimeConfig(
  leaders: LeaderConfig[] = [testLeader()]
): RuntimeConfig {
  return {
    wallet: {
      privateKey: "0x" + "1".repeat(64),
      proxyAddress: "0x" + "2".repeat(40),
      signatureType: 0,
      chainId: 137,
      clobUrl: "https://clob.polymarket.com",
      dataApiUrl: "https://data-api.polymarket.com",
      tradingBackend: "secure",
      builderCode: POLYMARKET_BUILDER_CODE,
    },
    app: {
      global: {
        previewMode: true,
        pollIntervalMs: 5000,
        activityLimit: 100,
        copyTradesOnly: true,
        maxTradeAgeHours: 1,
        buyDedupWindowMs: 60_000,
        tradeAggregationWindowMs: 0,
        healthPort: 0,
        risk: {
          enableCopyTrading: true,
          dailyLossCapPct: 20,
          startingCapitalUsd: 500,
          maxDailyVolumeUsd: 500,
          maxOpenMarkets: 15,
          maxOrderUsd: 25,
          minOrderUsd: 1,
          slippageTolerance: 0,
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
      leaders,
    },
  };
}
