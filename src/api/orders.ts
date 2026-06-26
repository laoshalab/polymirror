import type { AccountApiContext } from "../accounts/manager.js";
import { ClobExecutor } from "../executor/clob.js";
import { isPreviewOrderId } from "../engine/pending-orders.js";
import { logInfo } from "../notify/logger.js";

export async function cancelPendingOrder(
  actx: AccountApiContext,
  orderId: string
): Promise<{ status: number; body: unknown }> {
  const id = orderId.trim();
  if (!id) {
    return { status: 400, body: { error: "orderId required" } };
  }
  if (isPreviewOrderId(id)) {
    return { status: 400, body: { error: "Cannot cancel preview-only order id" } };
  }

  const config = actx.getConfig();
  if (config.app.global.previewMode) {
    return {
      status: 400,
      body: { error: "Cannot cancel CLOB orders while in Preview mode" },
    };
  }

  const row = actx.store.listPendingOrders().find((o) => o.orderId === id);
  if (!row) {
    return { status: 404, body: { error: "Pending order not found" } };
  }

  const executor = new ClobExecutor(config.wallet, config.app.global);
  const cancel = await executor.cancelOrder(id);
  if (!cancel.ok) {
    return {
      status: 502,
      body: {
        error: cancel.error ?? "Cancel failed",
        hint: "Order may already be filled or removed on CLOB; refresh pending list",
      },
    };
  }

  actx.store.removePendingOrder(id);
  logInfo("Pending order cancelled via dashboard", {
    accountId: actx.accountId,
    orderId: id.slice(0, 12),
    leaderId: row.leaderId,
  });

  return {
    status: 200,
    body: {
      ok: true,
      orderId: id,
      message: "订单已从 CLOB 撤销并移出 pending 列表",
      orders: actx.store.listPendingOrders(),
    },
  };
}
