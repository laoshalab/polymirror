import type { RuntimeConfig } from "../config/types.js";
import { pollLeaders } from "../monitor/poll.js";
import { tradeEventKey } from "../monitor/data-api.js";
import type { Activity } from "../monitor/data-api.js";
import { processSettlements } from "../engine/settlement.js";
import { calculateOrderSize } from "../engine/sizing.js";
import { passActivityFilters } from "../engine/filters.js";
import { isAnyTradeKeySeen, isRecentBuyDuplicate } from "../engine/dedup.js";
import { ConflictTracker } from "../engine/conflict.js";
import { aggregateTrades } from "../engine/aggregate.js";
import { RiskGate, assertLiveTradingAllowed } from "../engine/risk.js";
import type { StateStore } from "../state/store.js";
import { processPendingOrders } from "../engine/pending-orders.js";
import { adoptUntrackedOpenOrders } from "../engine/order-reconcile.js";
import {
  checkWalletDrifts,
  fetchWalletCollateralUsdc,
  fetchWalletCollateral,
  checkLiveBuyCollateralAndAllowance,
  checkLiveSellFromSnapshot,
  fetchConditionalTokenSnapshot,
  canTradeWithChainFallback,
  proportionalSellable,
  TokenBalanceCache,
} from "../executor/balance.js";
import { ClobExecutor, isDefiniteOrderRejection, type PlaceOrderResult } from "../executor/clob.js";
import {
  formatGeoblockMessage,
  getCachedGeoblockStatus,
} from "../executor/geoblock.js";
import { fetchBestExecutablePrice } from "../executor/orderbook.js";
import { logInfo, logError, logPreviewAction } from "../notify/logger.js";
import {
  healthSnapshot,
  syncAggregateHealth,
} from "../notify/health.js";
import { assertDashboardAuthForBind } from "../api/auth.js";
import { syncApiServer, type ApiServerState } from "../api/server.js";
import { AccountManager } from "../accounts/manager.js";
import { LeaderRegistry } from "../leaders/registry.js";
import { loadTelegramConfig, TelegramNotifier } from "../notify/telegram.js";
import { ensureUndiciGlobalProxy } from "../util/proxy.js";

/** Wallet drift checks hit CLOB once per open token — throttle to avoid blocking every poll. */
const DRIFT_CHECK_INTERVAL_MS = 120_000;
const lastDriftCheckByWallet = new Map<string, number>();

export interface CopyCycleResult {
  fetched: number;
  copied: number;
  skipped: number;
  pendingFilled: number;
  redeemed: number;
  autoSettled: number;
  errors: string[];
  walletDrifts: string[];
  pendingOrders: number;
}

interface QueuedTrade {
  leaderId: string;
  activity: Activity;
  sourceTradeKeys: string[];
}

function skip(
  store: StateStore,
  leaderId: string,
  activity: Activity,
  reason: string,
  preview: boolean
): void {
  store.audit({
    leaderId,
    action: "SKIP",
    tokenId: activity.asset,
    side: activity.side,
    size: activity.size,
    price: activity.price,
    reason,
    preview,
  });
}

export async function runCopyCycle(
  config: RuntimeConfig,
  store: StateStore,
  telegram?: TelegramNotifier
): Promise<CopyCycleResult> {
  const registry = new LeaderRegistry(config.app.leaders);
  const executor = new ClobExecutor(config.wallet, config.app.global);
  const risk = new RiskGate(config.app.global, store);
  const conflict = new ConflictTracker();
  const leaderMap = new Map(registry.enabled().map((l) => [l.id, l]));
  const errors: string[] = [];
  let fetched = 0;
  let copied = 0;
  let skipped = 0;
  let pendingFilled = 0;
  let redeemed = 0;
  let autoSettled = 0;

  const pendingResult = await processPendingOrders(config, store, risk, telegram);
  pendingFilled += pendingResult.filled;
  errors.push(...pendingResult.errors);

  const preview = config.app.global.previewMode;

  if (preview) {
    store.ensurePreviewCash(config.app.global.risk.startingCapitalUsd);
  }

  const settlement = await processSettlements(
    registry,
    config.app.global,
    store,
    preview,
    {
      dataApiUrl: config.wallet.dataApiUrl,
      wallet: preview ? undefined : config.wallet,
    }
  );
  redeemed += settlement.leaderRedeems;
  autoSettled += settlement.autoSettled;
  errors.push(...settlement.errors);

  const gate = risk.canTrade();
  if (!gate.allow) {
    logInfo("Copy cycle blocked", { reason: gate.reason });
    if (gate.reason?.includes("daily loss cap") && telegram) {
      telegram.killSwitch(gate.reason);
    }
    return {
      fetched: 0,
      copied: 0,
      skipped: 0,
      pendingFilled,
      redeemed,
      autoSettled,
      errors: gate.reason ? [gate.reason, ...errors] : errors,
      walletDrifts: [],
      pendingOrders: store.countPendingOrders(),
    };
  }

  if (!config.app.global.previewMode) {
    const orphanResult = await adoptUntrackedOpenOrders(executor, store);
    if (orphanResult.adopted > 0) {
      logInfo("Recovered orphan CLOB orders", { adopted: orphanResult.adopted });
    }
    errors.push(...orphanResult.warnings);
  }

  let liveCollateral: Awaited<ReturnType<typeof fetchWalletCollateral>> | undefined;
  let walletDrifts: string[] = [];
  const tokenBalanceCache = !preview && config.app.global.risk.syncWalletBalance
    ? new TokenBalanceCache()
    : undefined;
  const sellBalanceFetchOpts = {
    cache: tokenBalanceCache,
    retries: Math.min(config.app.global.execution.networkRetryLimit, 1),
  };

  const walletKey = config.wallet.proxyAddress.toLowerCase();
  const openTokenIds = store.listOpenTokenIds();
  const shouldRunDriftCheck =
    !preview &&
    config.app.global.risk.syncWalletBalance &&
    openTokenIds.length > 0 &&
    Date.now() - (lastDriftCheckByWallet.get(walletKey) ?? 0) >= DRIFT_CHECK_INTERVAL_MS;

  if (shouldRunDriftCheck) {
    lastDriftCheckByWallet.set(walletKey, Date.now());
  }

  const driftPromise = shouldRunDriftCheck
    ? checkWalletDrifts(
        config.wallet,
        openTokenIds,
        (tokenId) => store.getTotalTokenShares(tokenId),
        0.02,
        { cache: tokenBalanceCache, retries: 0 }
      )
    : Promise.resolve([]);

  const pendingOrders = store.countPendingOrders();

  const [drifts, pollResults] = await Promise.all([
    driftPromise,
    pollLeaders(registry, config.app.global, config.wallet.dataApiUrl),
  ]);

  if (shouldRunDriftCheck) {
    walletDrifts = drifts.map(
      (d) => `${d.tokenId.slice(0, 12)}: wallet=${d.walletShares} tracked=${d.trackedShares}`
    );
    if (drifts.length > 0) {
      logInfo("Wallet vs tracked position drift", { drifts: walletDrifts });
    }
  }

  const rawQueue: QueuedTrade[] = [];

  for (const result of pollResults) {
    if (result.error) {
      errors.push(`${result.leaderId}: poll failed — ${result.error}`);
    }
    fetched += result.fetched;
    for (const activity of result.candidates) {
      rawQueue.push({
        leaderId: result.leaderId,
        activity,
        sourceTradeKeys: [tradeEventKey(activity)],
      });
    }
  }

  const aggregated = aggregateTrades(
    rawQueue,
    config.app.global.tradeAggregationWindowMs
  );
  const queue: QueuedTrade[] = aggregated.map((a) => ({
    leaderId: a.leaderId,
    activity: a.activity,
    sourceTradeKeys: a.sourceTradeKeys,
  }));

  const buyWindow = config.app.global.buyDedupWindowMs;

  let geoblockMsg: string | undefined;
  if (!preview) {
    const geo = await getCachedGeoblockStatus();
    if (geo?.blocked) {
      geoblockMsg = formatGeoblockMessage(geo);
      logError("Live copy blocked by CLOB geoblock", {
        ip: geo.ip,
        country: geo.country,
        region: geo.region,
      });
      errors.push(geoblockMsg);
    }
  }

  for (const { leaderId, activity, sourceTradeKeys } of queue) {
    const leader = registry.getById(leaderId);
    if (!leader || !leader.enabled || !activity.asset || !activity.side) continue;

    if (geoblockMsg) {
      skipped++;
      skip(store, leaderId, activity, geoblockMsg, preview);
      continue;
    }

    store.audit({
      leaderId,
      action: "DETECT",
      tokenId: activity.asset,
      side: activity.side,
      size: activity.size,
      price: activity.price,
      preview,
    });

    const filter = passActivityFilters(leader, activity);
    if (!filter.pass) {
      skipped++;
      skip(store, leaderId, activity, filter.reason ?? "filter", preview);
      continue;
    }

    if (isAnyTradeKeySeen(store, sourceTradeKeys)) {
      skipped++;
      continue;
    }

    if (isRecentBuyDuplicate(store, leaderId, activity, buyWindow)) {
      skipped++;
      skip(store, leaderId, activity, "recent buy dedup", preview);
      continue;
    }

    const conflictDecision = conflict.check(
      config.app.global.conflict,
      leaderMap,
      leaderId,
      activity
    );
    if (!conflictDecision.allow) {
      skipped++;
      skip(store, leaderId, activity, conflictDecision.reason ?? "conflict", preview);
      continue;
    }

    const sizing = calculateOrderSize(leader, config.app.global, activity, store);
    if (sizing.belowMinimum) {
      store.markSeenMany(sourceTradeKeys, leaderId);
      skipped++;
      skip(store, leaderId, activity, sizing.reasoning, preview);
      continue;
    }

    const openCheck = risk.canOpenNewMarket(activity.asset, activity.side);
    if (!openCheck.allow) {
      skipped++;
      skip(store, leaderId, activity, openCheck.reason ?? "max markets", preview);
      continue;
    }

    const spendCheck = risk.canSpendUsd(
      leaderId,
      sizing.finalUsd,
      activity.side,
      leader.limits?.maxDailyVolumeUsd
    );
    if (!spendCheck.allow) {
      skipped++;
      skip(store, leaderId, activity, spendCheck.reason ?? "volume cap", preview);
      continue;
    }

    const leaderPrice = activity.price ?? 0;

    if (activity.side === "BUY") {
      if (preview) {
        const cashCheck = risk.canAffordPreviewBuy(
          sizing.finalUsd,
          config.app.global.risk.startingCapitalUsd
        );
        if (!cashCheck.allow) {
          skipped++;
          skip(store, leaderId, activity, cashCheck.reason ?? "insufficient preview cash", preview);
          continue;
        }
      }

      const tokenCap = risk.canAddTokenExposure(
        activity.asset,
        sizing.finalUsd,
        leaderPrice
      );
      if (!tokenCap.allow) {
        skipped++;
        skip(store, leaderId, activity, tokenCap.reason ?? "token exposure cap", preview);
        continue;
      }

      if (!preview) {
        if (!liveCollateral) {
          liveCollateral = await fetchWalletCollateral(config.wallet);
        }
        const tradeable = liveCollateral.clobUsd ?? 0;
        const chain = liveCollateral.chainUsd ?? 0;
        const chainFallback = canTradeWithChainFallback(liveCollateral);
        if (tradeable <= 0 && chain > 0 && !chainFallback) {
          skipped++;
          skip(
            store,
            leaderId,
            activity,
            `CLOB $0 but chain pUSD $${chain.toFixed(2)} — approve pUSD on polymarket.com (trade once)`,
            preview
          );
          continue;
        }
        const buyBalanceUsd = chainFallback ? chain : tradeable;
        const buyAllowanceUsd = chainFallback ? chain : liveCollateral.clobAllowanceUsd;
        const collateral = checkLiveBuyCollateralAndAllowance(
          buyBalanceUsd,
          buyAllowanceUsd,
          sizing.finalUsd,
          config.app.global.risk.minOrderUsd
        );
        if (!collateral.allow) {
          skipped++;
          skip(store, leaderId, activity, collateral.reason ?? "insufficient USDC", preview);
          continue;
        }
      }
    }

    if (activity.side === "SELL") {
      let held = store.getPosition(leaderId, activity.asset);
      let sellSnap: Awaited<ReturnType<typeof fetchConditionalTokenSnapshot>> = null;

      if (!preview) {
        if (config.app.global.risk.syncWalletBalance) {
          sellSnap = await fetchConditionalTokenSnapshot(
            config.wallet,
            activity.asset,
            { refresh: true, ...sellBalanceFetchOpts }
          );
          if (sellSnap !== null) {
            const totalTracked = store.getTotalTokenShares(activity.asset);
            held = proportionalSellable(held, sellSnap.balance, totalTracked);
          }
        }

        if (held < sizing.finalShares) {
          const reason = `SELL held=${held} need=${sizing.finalShares}`;
          errors.push(`${leaderId}: ${reason}`);
          store.markSeenMany(sourceTradeKeys, leaderId);
          skipped++;
          skip(store, leaderId, activity, reason, preview);
          continue;
        }

        if (sellSnap === null) {
          sellSnap = await fetchConditionalTokenSnapshot(
            config.wallet,
            activity.asset,
            { refresh: true, ...sellBalanceFetchOpts }
          );
        }
        const sellAllowance = sellSnap
          ? checkLiveSellFromSnapshot(sellSnap, sizing.finalShares)
          : {
              allow: false as const,
              reason: "token allowance check failed: CLOB balance unavailable",
            };
        if (!sellAllowance.allow) {
          skipped++;
          skip(store, leaderId, activity, sellAllowance.reason ?? "token allowance", preview);
          continue;
        }
      } else if (held < sizing.finalShares) {
        const reason = `SELL held=${held} need=${sizing.finalShares}`;
        errors.push(`${leaderId}: ${reason}`);
        store.markSeenMany(sourceTradeKeys, leaderId);
        skipped++;
        skip(store, leaderId, activity, reason, preview);
        continue;
      }
    }

    if (!preview && config.app.global.risk.slippageTolerance > 0) {
      const ref = await fetchBestExecutablePrice(
        config.wallet.clobUrl,
        config.wallet.chainId,
        activity.asset,
        activity.side
      );
      if (ref === null) {
        skipped++;
        skip(store, leaderId, activity, "slippage reference price unavailable", preview);
        continue;
      }
      const slip = risk.checkSlippage(leaderPrice, ref);
      if (!slip.allow) {
        skipped++;
        skip(store, leaderId, activity, slip.reason ?? "slippage", preview);
        continue;
      }
    }

    const orderReq = {
      tokenId: activity.asset,
      side: activity.side,
      price: leaderPrice,
      size: sizing.finalShares,
    };

    const tradeKeys = sourceTradeKeys;

    let orderResult: PlaceOrderResult;
    orderResult = await executor.placeLimitOrder(orderReq);

    if (orderResult.error) {
      const recovered = await executor.recoverOrderAfterFailure(orderReq);
      if (recovered) {
        orderResult = recovered;
      } else {
        errors.push(`${leaderId}: ${orderResult.error}`);
        store.audit({
          leaderId,
          action: "ERROR",
          tokenId: activity.asset,
          side: activity.side,
          size: sizing.finalShares,
          price: activity.price,
          reason: orderResult.error,
          preview,
        });
        if (isDefiniteOrderRejection(orderResult.error)) {
          store.markSeenMany(tradeKeys, leaderId);
        }
        telegram?.error(`${leaderId} ${activity.side} ${orderResult.error}`);
        continue;
      }
    }

    if (!orderResult.orderId && !orderResult.preview) {
      const needsOrderId =
        orderResult.pendingRemaining > 0 || orderResult.filledShares <= 0;
      if (needsOrderId) {
        const recovered = await executor.recoverOrderAfterFailure(orderReq);
        if (recovered?.orderId) {
          orderResult = recovered;
        }
      }
    }

    if (preview) {
      if (orderResult.filledShares <= 0) {
        store.markSeenMany(tradeKeys, leaderId);
        skipped++;
        skip(
          store,
          leaderId,
          activity,
          orderResult.pendingRemaining > 0
            ? `GTC pending (${orderResult.orderStatus ?? "resting"})`
            : (orderResult.orderStatus ?? "order submitted — no fill"),
          preview
        );
        continue;
      }

      store.recordCopySuccess({
        tradeKeys,
        leaderId,
        tokenId: activity.asset,
        side: activity.side,
        filledShares: orderResult.filledShares,
        price: leaderPrice,
        filledUsd: orderResult.filledUsd,
        auditReason: sizing.reasoning,
        preview: true,
      });
    } else {
      if (
        !orderResult.orderId &&
        (orderResult.pendingRemaining > 0 || orderResult.filledShares <= 0)
      ) {
        const msg =
          orderResult.pendingRemaining > 0
            ? `GTC pending without order id (remaining ${orderResult.pendingRemaining})`
            : "order submitted without order id";
        errors.push(`${leaderId}: ${msg}`);
        store.audit({
          leaderId,
          action: "ERROR",
          tokenId: activity.asset,
          side: activity.side,
          size: sizing.finalShares,
          price: activity.price,
          reason: msg,
          preview,
        });
        continue;
      }

      store.recordLiveOrderAccepted({
        tradeKeys,
        leaderId,
        tokenId: activity.asset,
        side: activity.side,
        price: leaderPrice,
        orderSize: sizing.finalShares,
        filledShares: orderResult.filledShares,
        filledUsd: orderResult.filledUsd,
        auditReason: sizing.reasoning,
        orderId: orderResult.orderId,
        pendingRemaining: orderResult.pendingRemaining,
        trackPendingGtc: config.app.global.execution.orderType === "GTC",
      });
      healthSnapshot.pendingOrders = store.countPendingOrders();

      if (orderResult.filledShares <= 0) {
        skipped++;
        skip(
          store,
          leaderId,
          activity,
          orderResult.pendingRemaining > 0
            ? `GTC pending (${orderResult.orderStatus ?? "resting"})`
            : (orderResult.orderStatus ?? "order submitted — no fill"),
          preview
        );
        continue;
      }
    }

    const details = {
      leader: leaderId,
      side: activity.side,
      size: orderResult.filledShares,
      price: activity.price,
      token: activity.asset.slice(0, 12),
      reasoning: sizing.reasoning,
      preview,
      orderId: orderResult.orderId,
      orderStatus: orderResult.orderStatus,
    };

    if (preview) {
      logPreviewAction(details);
    } else {
      logInfo("Copied trade", details);
    }

    const tag = preview ? "[PREVIEW]" : "[LIVE]";
    telegram?.copy(
      `${tag} ${leaderId} ${activity.side} ${orderResult.filledShares} @ ${leaderPrice} ($${orderResult.filledUsd.toFixed(2)})`
    );
    copied++;
  }

  healthSnapshot.pendingOrders = store.countPendingOrders();
  return {
    fetched,
    copied,
    skipped,
    pendingFilled,
    redeemed,
    autoSettled,
    errors,
    walletDrifts,
    pendingOrders,
  };
}

export async function startBot(configPath = "config.yaml"): Promise<void> {
  const manager = await AccountManager.create(configPath);
  const accounts = manager.enabled();

  for (const account of accounts) {
    assertLiveTradingAllowed(account.config.app.global.previewMode);
  }

  await ensureUndiciGlobalProxy();

  const liveAccount = accounts.find((a) => !a.config.app.global.previewMode);
  if (liveAccount) {
    const { fetchGeoblockStatus, formatGeoblockMessage } = await import("../executor/geoblock.js");
    const geo = await fetchGeoblockStatus();
    if (geo?.blocked) {
      logError("Polymarket geoblock detected at startup", {
        ip: geo.ip,
        country: geo.country,
        region: geo.region,
      });
      logInfo(formatGeoblockMessage(geo));
    } else if (geo) {
      logInfo("Polymarket geoblock check passed", {
        ip: geo.ip,
        country: geo.country,
        region: geo.region,
      });
    }
  }

  for (const account of accounts) {
    if (!account.config.app.global.previewMode) {
      const { ensureTradingReady } = await import("../executor/secure-client.js");
      await ensureTradingReady(account.config.wallet);
    }
  }

  syncAggregateHealth(manager.list());
  healthSnapshot.startedAt = Date.now();

  const firstAccount = manager.list()[0];
  const tgEnv = loadTelegramConfig();
  const telegram = new TelegramNotifier({
    botToken: tgEnv.botToken,
    chatId: tgEnv.chatId,
    onCopy: firstAccount?.config.app.global.notify.telegramOnCopy && tgEnv.onCopy,
    onError: firstAccount?.config.app.global.notify.telegramOnError && tgEnv.onError,
    onKillSwitch:
      firstAccount?.config.app.global.notify.telegramOnKillSwitch && tgEnv.onKillSwitch,
  });

  logInfo("PolyMirror starting", {
    accounts: manager.list().map((a) => ({
      id: a.id,
      enabled: a.enabled,
      preview: a.config.app.global.previewMode,
      tradingBackend: a.config.wallet.tradingBackend,
      dbPath: a.dbPath,
      leaders: a.config.app.leaders
        .filter((l) => l.enabled)
        .map((l) => ({ id: l.id, address: l.address?.slice(0, 10) })),
    })),
    pollMs: manager.pollIntervalMs,
    healthPort: manager.healthPort,
  });

  assertDashboardAuthForBind();

  const apiCtx = {
    manager,
    configPath: manager.configPath,
    configFileKey: manager.configFileKey,
    reloadConfig: () => manager.reloadConfig(),
  };
  const apiState: ApiServerState = { server: null, port: 0 };
  syncApiServer(apiState, manager.healthPort, apiCtx);

  let cycleRunning = false;
  let pollIntervalMs = manager.pollIntervalMs;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const schedulePoll = (ms: number) => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(tick, ms);
  };

  const tick = async () => {
    const nextMs = manager.pollIntervalMs;
    if (nextMs !== pollIntervalMs) {
      pollIntervalMs = nextMs;
      schedulePoll(pollIntervalMs);
      logInfo("Poll interval updated", { pollMs: pollIntervalMs });
    }

    syncApiServer(apiState, manager.healthPort, apiCtx);

    if (cycleRunning) {
      logInfo("Skipping poll tick — previous cycle still running");
      return;
    }
    cycleRunning = true;
    try {
      for (const account of manager.enabled()) {
        const tag = `[${account.id}]`;
        try {
          const result = await runCopyCycle(account.config, account.store, telegram);
          manager.updateHealthAfterPoll(account.id, result, result.walletDrifts);
          if (result.fetched > 0 || result.copied > 0 || result.errors.length > 0) {
            logInfo(`${tag} Poll complete`, result);
          }
          if (result.errors.length > 0) {
            result.errors.slice(0, 5).forEach((e) => logError(`${tag} ${e}`));
          }
          if (account.store.isKillSwitchActive()) {
            telegram.killSwitch(`${tag} active — no new copies until tomorrow UTC`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logError(`${tag} Poll failed`, { error: msg });
          account.health.lastError = msg;
          telegram.error(`${tag} Poll failed: ${msg}`);
        }
      }
      syncAggregateHealth(manager.list());
    } finally {
      cycleRunning = false;
    }
  };

  const shutdown = (signal: string) => {
    logInfo("Shutting down", { signal });
    if (pollTimer) clearInterval(pollTimer);
    if (apiState.server) {
      apiState.server.close();
      apiState.server = null;
    }
    manager.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await tick();
  schedulePoll(pollIntervalMs);
}
