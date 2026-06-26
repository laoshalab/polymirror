import type { RuntimeConfig } from "../config/types.js";
import { StateStore } from "../state/store.js";
import { RiskGate } from "../engine/risk.js";
import { processPendingOrders, isPreviewOrderId } from "../engine/pending-orders.js";
import { resolveAccountDbPath } from "../state/db-path.js";
import { logInfo, logError } from "../notify/logger.js";

export function countLivePendingOrders(store: StateStore): number {
  return store.listPendingOrders().filter((r) => !isPreviewOrderId(r.orderId)).length;
}

/** Reconcile (and cancel stale) live CLOB pending orders before leaving Live / stopping copy. */
export async function flushLivePendingBeforePreview(
  config: RuntimeConfig,
  store: StateStore
): Promise<{ resolved: number; remaining: number; errors: string[] }> {
  if (config.app.global.previewMode) {
    return { resolved: 0, remaining: 0, errors: [] };
  }

  const before = countLivePendingOrders(store);
  if (before === 0) {
    return { resolved: 0, remaining: 0, errors: [] };
  }

  logInfo("Flushing live pending orders before preview/stop", { count: before });
  const risk = new RiskGate(config.app.global, store);
  const result = await processPendingOrders(config, store, risk);
  const remaining = countLivePendingOrders(store);

  if (remaining > 0) {
    logError("Live pending orders remain after flush", {
      remaining,
      errors: result.errors.slice(0, 3),
    });
  }

  return { resolved: result.resolved, remaining, errors: result.errors };
}

export interface PreviewToLiveMigration {
  seenImported: number;
  positionsImported: number;
  livePath: string;
}

/**
 * Merge Preview dedup + engine positions into Live DB on Preview→Live switch.
 * Positions are tracking metadata only; chain wallet is authoritative for SELL.
 */
export function migratePreviewToLiveDb(
  accountId: string,
  previewStore: StateStore
): PreviewToLiveMigration {
  const livePath = resolveAccountDbPath(accountId, false);
  const liveStore = new StateStore(livePath);
  try {
    const seenImported = liveStore.importSeenTradesFrom(previewStore);
    const positionsImported = liveStore.importPositionsFrom(previewStore);
    if (seenImported > 0 || positionsImported > 0) {
      logInfo("Migrated preview state to live DB", {
        accountId,
        seenImported,
        positionsImported,
        livePath,
      });
    }
    return { seenImported, positionsImported, livePath };
  } finally {
    liveStore.close();
  }
}

/** @deprecated use migratePreviewToLiveDb */
export function migrateSeenTradesToLiveDb(accountId: string, previewStore: StateStore): number {
  return migratePreviewToLiveDb(accountId, previewStore).seenImported;
}
