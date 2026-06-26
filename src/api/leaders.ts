import type { AccountApiContext } from "../accounts/manager.js";
import type { ApiContext } from "./routes.js";
import type { LeaderConfig } from "../config/types.js";
import { readNormalizedConfigDocument, removeLeaderFromAccount, writeNormalizedConfigDocument } from "../config/write.js";
import { ClobExecutor } from "../executor/clob.js";
import { isPreviewOrderId } from "../engine/pending-orders.js";
import { buildUnfollowMessage, liquidateLeaderPositions } from "../engine/unfollow-liquidate.js";
import { syncAggregateHealth } from "../notify/health.js";
import { logInfo } from "../notify/logger.js";

export function findLeaderIdForTrader(
  leaders: LeaderConfig[],
  address: string,
  userName?: string
): string | undefined {
  const addrLower = address.toLowerCase();
  const userLower = userName?.replace(/^@/, "").trim().toLowerCase();
  const match = leaders.find(
    (l) =>
      l.address?.toLowerCase() === addrLower ||
      (userLower && l.username?.replace(/^@/, "").trim().toLowerCase() === userLower)
  );
  return match?.id;
}

async function cancelLeaderPendingOrders(
  actx: AccountApiContext,
  leaderId: string
): Promise<{ cancelled: number; failed: number; errors: string[] }> {
  const pending = actx.store.listPendingOrders().filter((o) => o.leaderId === leaderId);
  if (pending.length === 0) {
    return { cancelled: 0, failed: 0, errors: [] };
  }

  const config = actx.getConfig();
  const preview = config.app.global.previewMode;
  const executor = preview ? null : new ClobExecutor(config.wallet, config.app.global);

  let cancelled = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of pending) {
    if (preview || isPreviewOrderId(row.orderId)) {
      actx.store.removePendingOrder(row.orderId);
      cancelled++;
      continue;
    }

    const result = await executor!.cancelOrder(row.orderId);
    if (!result.ok) {
      failed++;
      errors.push(`${row.orderId.slice(0, 12)}: ${result.error ?? "cancel failed"}`);
      continue;
    }
    actx.store.removePendingOrder(row.orderId);
    cancelled++;
  }

  return { cancelled, failed, errors };
}

export async function deleteLeader(
  root: ApiContext,
  actx: AccountApiContext,
  leaderId: string
): Promise<{ status: number; body: unknown }> {
  const id = leaderId.trim();
  if (!id) {
    return { status: 400, body: { error: "leaderId required" } };
  }

  try {
    const normalized = readNormalizedConfigDocument(root.configPath);
    const account = normalized.accounts.find((a) => a.id === actx.accountId);
    const existing = account?.leaders.find((l) => l.id === id);
    if (!existing) {
      return { status: 404, body: { error: `Leader not found: ${id}` } };
    }

    const positionCountBefore = actx.store
      .listPositions()
      .filter((p) => p.leaderId === id && p.shares > 0).length;
    const pending = await cancelLeaderPendingOrders(actx, id);
    const config = actx.getConfig();
    const liquidation = await liquidateLeaderPositions(config, actx.store, id);
    const positionsRemaining = actx.store
      .listPositions()
      .filter((p) => p.leaderId === id && p.shares > 0.001).length;

    const next = removeLeaderFromAccount(normalized, actx.accountId, id);
    writeNormalizedConfigDocument(root.configPath, next);
    await root.reloadConfig();
    syncAggregateHealth(root.manager.list());

    logInfo("Leader unfollowed via dashboard", {
      accountId: actx.accountId,
      leaderId: id,
      pendingCancelled: pending.cancelled,
      pendingFailed: pending.failed,
      positionsBefore: positionCountBefore,
      positionsRemaining,
      liquidationClosed: liquidation.closed,
      liquidationPending: liquidation.pending,
      liquidationFailed: liquidation.failed,
    });

    const allErrors = [...pending.errors, ...liquidation.errors];

    return {
      status: 200,
      body: {
        ok: true,
        leaderId: id,
        pendingCancelled: pending.cancelled,
        pendingFailed: pending.failed,
        positionsBefore: positionCountBefore,
        positionsRemaining,
        liquidation,
        positionsKept: positionsRemaining,
        message: buildUnfollowMessage(id, pending, liquidation, positionsRemaining),
        errors: allErrors.length ? allErrors : undefined,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 400, body: { error: msg } };
  }
}
