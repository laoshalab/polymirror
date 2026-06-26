import type { GlobalConfig } from "../config/types.js";
import type { StateStore } from "../state/store.js";
import { logError } from "../notify/logger.js";

export interface RiskCheckResult {
  allow: boolean;
  reason?: string;
}

export class RiskGate {
  constructor(
    private readonly global: GlobalConfig,
    private readonly store: StateStore
  ) {}

  canTrade(): RiskCheckResult {
    if (!this.global.risk.enableCopyTrading) {
      return { allow: false, reason: "copy trading disabled" };
    }
    if (this.store.isKillSwitchActive()) {
      return { allow: false, reason: "kill switch active" };
    }
    const lossCheck = this.checkDailyLossCap();
    if (!lossCheck.allow) return lossCheck;
    return { allow: true };
  }

  checkDailyLossCap(): RiskCheckResult {
    const pnl = this.store.getDailyRealizedPnl();
    if (pnl >= 0) return { allow: true };

    const capital = this.global.risk.startingCapitalUsd;
    if (capital <= 0) return { allow: true };

    const lossPct = (Math.abs(pnl) / capital) * 100;
    if (lossPct >= this.global.risk.dailyLossCapPct) {
      this.store.triggerKillSwitch();
      return {
        allow: false,
        reason: `daily loss cap ${lossPct.toFixed(1)}% >= ${this.global.risk.dailyLossCapPct}%`,
      };
    }
    return { allow: true };
  }

  canOpenNewMarket(tokenId: string, side: "BUY" | "SELL"): RiskCheckResult {
    if (side !== "BUY") return { allow: true };

    const open = this.store.countOpenMarkets();
    if (open >= this.global.risk.maxOpenMarkets && !this.store.hasOpenPosition(tokenId)) {
      return {
        allow: false,
        reason: `max open markets ${this.global.risk.maxOpenMarkets}`,
      };
    }
    return { allow: true };
  }

  canSpendUsd(leaderId: string, usd: number, leaderMaxDaily?: number): RiskCheckResult {
    const today = this.store.getDailyVolumeUsd();
    if (today + usd > this.global.risk.maxDailyVolumeUsd) {
      return { allow: false, reason: "global max daily volume" };
    }
    if (leaderMaxDaily !== undefined) {
      const leaderToday = this.store.getLeaderDailyVolumeUsd(leaderId);
      if (leaderToday + usd > leaderMaxDaily) {
        return { allow: false, reason: `leader ${leaderId} max daily volume` };
      }
    }
    return { allow: true };
  }

  canAddTokenExposure(
    tokenId: string,
    additionalUsd: number,
    price: number
  ): RiskCheckResult {
    const cap = this.global.risk.maxPositionPerTokenUsd;
    if (cap <= 0 || price <= 0) return { allow: true };

    const heldShares = this.store.getTotalTokenShares(tokenId);
    const exposureUsd = heldShares * price + additionalUsd;
    if (exposureUsd > cap) {
      return {
        allow: false,
        reason: `token exposure $${exposureUsd.toFixed(2)} > cap $${cap}`,
      };
    }
    return { allow: true };
  }

  checkSlippage(leaderPrice: number, referencePrice: number): RiskCheckResult {
    const tol = this.global.risk.slippageTolerance;
    if (tol <= 0) return { allow: true };
    if (Math.abs(referencePrice - leaderPrice) > tol) {
      return {
        allow: false,
        reason: `slippage ${Math.abs(referencePrice - leaderPrice).toFixed(4)} > ${tol}`,
      };
    }
    return { allow: true };
  }

  recordCopy(leaderId: string, usd: number): void {
    this.store.addDailyVolume(usd);
    this.store.addLeaderDailyVolume(leaderId, usd);
  }
}

export function assertLiveTradingAllowed(previewMode: boolean): void {
  if (previewMode) return;
  const require = (process.env.REQUIRE_LIVE_CONFIRM ?? "true").toLowerCase() !== "false";
  const confirm = (process.env.POLYMIRROR_LIVE_CONFIRM ?? "").trim();
  if (require && confirm !== "I_UNDERSTAND_LIVE_TRADING") {
    throw new Error(
      "Live trading blocked: set POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING in .env"
    );
  }
  // Escape hatch is intentional (automation) but must never be silent.
  if (!require && confirm !== "I_UNDERSTAND_LIVE_TRADING") {
    logError(
      "LIVE trading confirmation bypassed via REQUIRE_LIVE_CONFIRM=false — real orders may be placed",
    );
  }
}

export function assertLiveTradingForAccounts(
  accounts: Array<{ config: { app: { global: { previewMode: boolean } } } }>
): void {
  for (const def of accounts) {
    assertLiveTradingAllowed(def.config.app.global.previewMode);
  }
}
