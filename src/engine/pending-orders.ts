import type { RuntimeConfig } from "../config/types.js";
import type { PendingOrderRow, StateStore } from "../state/store.js";
import type { RiskGate } from "../engine/risk.js";
import { ClobExecutor } from "../executor/clob.js";
import { logInfo, logError } from "../notify/logger.js";
import type { TelegramNotifier } from "../notify/telegram.js";

export function isPreviewOrderId(orderId: string): boolean {
  return orderId.startsWith("preview-");
}

export interface PendingOrderResult {
  resolved: number;
  filled: number;
  errors: string[];
  cancelledStale: number;
}

export interface PendingOrderDeps {
  createExecutor: (config: RuntimeConfig) => ClobExecutor;
}

const defaultDeps: PendingOrderDeps = {
  createExecutor: (config) => new ClobExecutor(config.wallet, config.app.global),
};

interface RowProcessResult {
  resolved: number;
  filled: number;
  cancelledStale: number;
  errors: string[];
}

function buildFillPayload(
  row: PendingOrderRow,
  delta: number,
  preview: boolean
): {
  leaderId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  delta: number;
  price: number;
  auditReason: string;
  preview: boolean;
} | undefined {
  if (delta <= 0) return undefined;
  return {
    leaderId: row.leaderId,
    tokenId: row.tokenId,
    side: row.side,
    delta,
    price: row.price,
    auditReason: `${row.reasoning}; pending fill`,
    preview,
  };
}

async function processPendingOrderRow(
  row: PendingOrderRow,
  opts: {
    executor: ClobExecutor;
    store: StateStore;
    preview: boolean;
    isStale: boolean;
    telegram?: TelegramNotifier;
  }
): Promise<RowProcessResult> {
  const { executor, store, preview, isStale, telegram } = opts;
  const empty: RowProcessResult = { resolved: 0, filled: 0, cancelledStale: 0, errors: [] };

  try {
    const statusResult = await executor.getOrderStatus(row.orderId, row.tokenId);
    if (statusResult.kind === "transient") {
      return {
        ...empty,
        errors: [
          `pending ${row.orderId.slice(0, 12)}: status check failed (${statusResult.message})`,
        ],
      };
    }
    if (statusResult.kind === "not_found") {
      store.removePendingOrder(row.orderId);
      return { ...empty, resolved: 1 };
    }

    const status = statusResult.status;
    const matched = Math.min(status.sizeMatched, row.size);
    const delta = Math.round((matched - row.filledShares) * 100) / 100;
    const fill = buildFillPayload(row, delta, preview);
    const terminal = status.terminal || matched >= row.size * 0.99;
    const filled = fill ? 1 : 0;

    if (terminal) {
      store.commitPendingOrderProgress({
        orderId: row.orderId,
        matchedFilledShares: matched,
        fill,
        remove: true,
      });
      if (fill) {
        logInfo("Pending order fill applied", {
          orderId: row.orderId.slice(0, 12),
          leader: row.leaderId,
          delta: fill.delta,
          status: status.status,
        });
        telegram?.copy(
          `[LIVE] pending fill ${row.leaderId} ${row.side} ${fill.delta} @ ${row.price}`
        );
      }
      return { resolved: 1, filled, cancelledStale: 0, errors: [] };
    }

    if (isStale) {
      const cancel = await executor.cancelOrder(row.orderId);
      if (cancel.ok) {
        logInfo("Cancelled stale pending order", {
          orderId: row.orderId.slice(0, 12),
          leader: row.leaderId,
          status: status.status,
        });
        store.commitPendingOrderProgress({
          orderId: row.orderId,
          matchedFilledShares: matched,
          fill,
          remove: true,
          staleSkipAudit: {
            leaderId: row.leaderId,
            tokenId: row.tokenId,
            side: row.side,
            size: row.size - matched,
            price: row.price,
            preview,
          },
        });
        if (fill) {
          logInfo("Pending order fill applied", {
            orderId: row.orderId.slice(0, 12),
            leader: row.leaderId,
            delta: fill.delta,
            status: status.status,
          });
          telegram?.copy(
            `[LIVE] pending fill ${row.leaderId} ${row.side} ${fill.delta} @ ${row.price}`
          );
        }
        return { resolved: 1, filled, cancelledStale: 1, errors: [] };
      }

      store.commitPendingOrderProgress({
        orderId: row.orderId,
        matchedFilledShares: matched,
        fill,
        remove: false,
      });
      if (fill) {
        logInfo("Pending order fill applied", {
          orderId: row.orderId.slice(0, 12),
          leader: row.leaderId,
          delta: fill.delta,
          status: status.status,
        });
        telegram?.copy(
          `[LIVE] pending fill ${row.leaderId} ${row.side} ${fill.delta} @ ${row.price}`
        );
      }
      return {
        resolved: 0,
        filled,
        cancelledStale: 0,
        errors: [
          `pending ${row.orderId.slice(0, 12)}: stale cancel failed (${cancel.error ?? "unknown"})`,
        ],
      };
    }

    store.commitPendingOrderProgress({
      orderId: row.orderId,
      matchedFilledShares: matched,
      fill,
      remove: false,
    });
    if (fill) {
      logInfo("Pending order fill applied", {
        orderId: row.orderId.slice(0, 12),
        leader: row.leaderId,
        delta: fill.delta,
        status: status.status,
      });
      telegram?.copy(
        `[LIVE] pending fill ${row.leaderId} ${row.side} ${fill.delta} @ ${row.price}`
      );
    }
    return { resolved: 0, filled, cancelledStale: 0, errors: [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError("Pending order processing failed", {
      orderId: row.orderId.slice(0, 12),
      error: msg,
    });
    return {
      ...empty,
      errors: [`pending ${row.orderId.slice(0, 12)}: ${msg}`],
    };
  }
}

export async function processPendingOrders(
  config: RuntimeConfig,
  store: StateStore,
  risk: RiskGate,
  telegram?: TelegramNotifier,
  deps: PendingOrderDeps = defaultDeps
): Promise<PendingOrderResult> {
  const maxAgeMs = config.app.global.execution.pendingOrderMaxAgeHours * 3600 * 1000;
  const now = Date.now();
  const pending = store.listPendingOrders().filter((r) => !isPreviewOrderId(r.orderId));
  if (pending.length === 0) {
    return { resolved: 0, filled: 0, errors: [], cancelledStale: 0 };
  }

  if (config.app.global.previewMode) {
    return {
      resolved: 0,
      filled: 0,
      errors: [`${pending.length} live pending order(s) skipped in preview mode`],
      cancelledStale: 0,
    };
  }

  const executor = deps.createExecutor(config);
  const preview = config.app.global.previewMode;
  let resolved = 0;
  let filled = 0;
  let cancelledStale = 0;
  const errors: string[] = [];

  for (const row of pending) {
    const isStale = now - row.createdAt > maxAgeMs;
    const result = await processPendingOrderRow(row, {
      executor,
      store,
      preview,
      isStale,
      telegram,
    });
    resolved += result.resolved;
    filled += result.filled;
    cancelledStale += result.cancelledStale;
    errors.push(...result.errors);
  }

  return { resolved, filled, errors, cancelledStale };
}
