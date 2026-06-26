import type { RuntimeConfig } from "../config/types.js";
import type { StateStore } from "../state/store.js";
import { ClobExecutor } from "../executor/clob.js";
import {
  checkLiveSellTokenAllowance,
  fetchWalletTokenBalance,
  proportionalSellable,
} from "../executor/balance.js";
import { fetchBestExecutablePrice } from "../executor/orderbook.js";
import { fetchGeoblockStatus, formatGeoblockMessage } from "../executor/geoblock.js";
import { logInfo, logError } from "../notify/logger.js";

export interface LeaderLiquidationResult {
  attempted: number;
  closed: number;
  pending: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function liquidateLeaderPositions(
  config: RuntimeConfig,
  store: StateStore,
  leaderId: string
): Promise<LeaderLiquidationResult> {
  const positions = store
    .listPositions()
    .filter((p) => p.leaderId === leaderId && p.shares > 0.001);

  if (positions.length === 0) {
    return { attempted: 0, closed: 0, pending: 0, skipped: 0, failed: 0, errors: [] };
  }

  const preview = config.app.global.previewMode;
  const global = config.app.global;
  const executor = new ClobExecutor(config.wallet, global);

  if (!preview) {
    const geo = await fetchGeoblockStatus();
    if (geo?.blocked) {
      const msg = formatGeoblockMessage(geo);
      logError("Unfollow liquidation blocked by geoblock", { leaderId });
      return {
        attempted: positions.length,
        closed: 0,
        pending: 0,
        skipped: 0,
        failed: positions.length,
        errors: [msg],
      };
    }
  }

  let attempted = 0;
  let closed = 0;
  let pending = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const pos of positions) {
    attempted++;
    let sellable = pos.shares;

    if (!preview && global.risk.syncWalletBalance) {
      const walletShares = await fetchWalletTokenBalance(config.wallet, pos.tokenId);
      if (walletShares !== null) {
        const totalTracked = store.getTotalTokenShares(pos.tokenId);
        sellable = proportionalSellable(pos.shares, walletShares, totalTracked);
      }
    }

    sellable = Math.round(sellable * 100) / 100;
    if (sellable <= 0.001) {
      skipped++;
      errors.push(`${pos.tokenId.slice(0, 12)}: sellable shares 0`);
      continue;
    }

    const bookPrice = await fetchBestExecutablePrice(
      config.wallet.clobUrl,
      config.wallet.chainId,
      pos.tokenId,
      "SELL"
    );
    const price = bookPrice && bookPrice > 0 ? bookPrice : pos.avgEntryPrice;
    if (price <= 0) {
      skipped++;
      errors.push(`${pos.tokenId.slice(0, 12)}: no sell price`);
      continue;
    }

    const notional = price * sellable;
    if (notional + 0.01 < global.risk.minOrderUsd) {
      skipped++;
      errors.push(
        `${pos.tokenId.slice(0, 12)}: notional $${notional.toFixed(2)} below min $${global.risk.minOrderUsd}`
      );
      continue;
    }

    if (!preview) {
      const allowance = await checkLiveSellTokenAllowance(config.wallet, pos.tokenId, sellable);
      if (!allowance.allow) {
        failed++;
        errors.push(`${pos.tokenId.slice(0, 12)}: ${allowance.reason ?? "allowance"}`);
        continue;
      }
    }

    const tradeKey = `unfollow-${leaderId}-${pos.tokenId}-${Date.now()}`;
    const orderResult = await executor.placeLimitOrder({
      tokenId: pos.tokenId,
      side: "SELL",
      price,
      size: sellable,
    });

    if (orderResult.error) {
      failed++;
      errors.push(`${pos.tokenId.slice(0, 12)}: ${orderResult.error}`);
      continue;
    }

    const auditReason = `unfollow liquidate ${leaderId}`;

    if (preview) {
      if (orderResult.filledShares <= 0) {
        failed++;
        errors.push(`${pos.tokenId.slice(0, 12)}: preview sell no fill`);
        continue;
      }
      store.recordCopySuccess({
        tradeKeys: [tradeKey],
        leaderId,
        tokenId: pos.tokenId,
        side: "SELL",
        filledShares: orderResult.filledShares,
        price,
        filledUsd: orderResult.filledUsd,
        auditReason,
        preview: true,
      });
      closed++;
    } else {
      store.recordLiveOrderAccepted({
        tradeKeys: [tradeKey],
        leaderId,
        tokenId: pos.tokenId,
        side: "SELL",
        price,
        orderSize: sellable,
        filledShares: orderResult.filledShares,
        filledUsd: orderResult.filledUsd,
        auditReason,
        orderId: orderResult.orderId,
        pendingRemaining: orderResult.pendingRemaining,
        trackPendingGtc: global.execution.orderType === "GTC",
      });

      if (orderResult.pendingRemaining > 0.001 && orderResult.orderId) {
        pending++;
      } else if (orderResult.filledShares >= sellable * 0.99) {
        closed++;
      } else if (orderResult.filledShares > 0) {
        closed++;
      } else {
        failed++;
        errors.push(`${pos.tokenId.slice(0, 12)}: sell order no fill`);
      }
    }

    logInfo("Unfollow liquidation order", {
      leaderId,
      token: pos.tokenId.slice(0, 12),
      sellable,
      filled: orderResult.filledShares,
      pending: orderResult.pendingRemaining,
      preview,
    });
  }

  return { attempted, closed, pending, skipped, failed, errors };
}

export function buildUnfollowMessage(
  leaderId: string,
  pending: { cancelled: number; failed: number },
  liquidation: LeaderLiquidationResult,
  positionsRemaining: number
): string {
  const parts = [`已撤销跟单：Leader ${leaderId} 已从配置移除。`];

  if (pending.cancelled > 0) {
    parts.push(`已撤销 ${pending.cancelled} 笔挂单。`);
  }
  if (pending.failed > 0) {
    parts.push(
      `有 ${pending.failed} 笔挂单未能撤销，请到 Polymarket 或 Pending 订单页手动检查。`
    );
  }

  if (liquidation.attempted > 0) {
    if (liquidation.closed > 0) {
      parts.push(`已卖出 ${liquidation.closed} 条持仓。`);
    }
    if (liquidation.pending > 0) {
      parts.push(`有 ${liquidation.pending} 笔卖单挂单中，请到 Pending 订单页查看。`);
    }
    if (liquidation.failed > 0) {
      parts.push(`${liquidation.failed} 条持仓未能卖出，请手动处理。`);
    }
    if (liquidation.skipped > 0) {
      parts.push(`${liquidation.skipped} 条持仓因金额过小或无余额跳过。`);
    }
  }

  if (positionsRemaining > 0) {
    parts.push(`仍有 ${positionsRemaining} 条本地跟踪持仓未清空。`);
  }

  return parts.join("");
}
