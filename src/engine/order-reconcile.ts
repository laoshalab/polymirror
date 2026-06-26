import type { StateStore } from "../state/store.js";
import type { ClobExecutor } from "../executor/clob.js";
import { logInfo } from "../notify/logger.js";

/** Leader id for orders recovered from CLOB without local metadata. */
export const RECOVERED_ORDER_LEADER = "_recovered";

/** Adopt open CLOB orders missing from pending_orders (e.g. crash after submit). */
export async function adoptUntrackedOpenOrders(
  executor: ClobExecutor,
  store: StateStore
): Promise<{ adopted: number; warnings: string[] }> {
  const warnings: string[] = [];
  const open = await executor.listOpenOrders();
  if (open.length === 0) return { adopted: 0, warnings };

  const pendingIds = new Set(store.listPendingOrders().map((r) => r.orderId));
  let adopted = 0;

  for (const order of open) {
    if (pendingIds.has(order.orderId)) continue;

    const side = order.side === "SELL" ? "SELL" : "BUY";
    let filledShares = 0;
    const statusResult = await executor.getOrderStatus(order.orderId, order.tokenId);
    if (statusResult.kind === "ok") {
      filledShares = Math.min(statusResult.status.sizeMatched, order.size);
    } else if (statusResult.kind === "transient") {
      warnings.push(
        `orphan ${order.orderId.slice(0, 12)}: status check failed (${statusResult.message})`
      );
    }

    store.upsertPendingOrder({
      orderId: order.orderId,
      leaderId: RECOVERED_ORDER_LEADER,
      tokenId: order.tokenId,
      side,
      price: order.price,
      size: order.size,
      filledShares,
      tradeKey: `recovered-${order.orderId}`,
      reasoning: "auto-recovered orphan CLOB order",
    });
    adopted++;
    logInfo("Adopted untracked open CLOB order", {
      orderId: order.orderId.slice(0, 12),
      token: order.tokenId.slice(0, 12),
      side,
      size: order.size,
      filledShares,
    });
  }

  return { adopted, warnings };
}

/** @deprecated use adoptUntrackedOpenOrders */
export async function warnUntrackedOpenOrders(
  executor: ClobExecutor,
  store: StateStore
): Promise<string[]> {
  const { adopted, warnings } = await adoptUntrackedOpenOrders(executor, store);
  if (adopted > 0) {
    warnings.unshift(`adopted ${adopted} orphan CLOB order(s) into pending_orders`);
  }
  return warnings;
}
