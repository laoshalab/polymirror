import type { CopyStrategyType, LeaderConfig, GlobalConfig } from "../config/types.js";
import type { Activity } from "../monitor/data-api.js";
import type { StateStore } from "../state/store.js";

export interface OrderSizeResult {
  finalUsd: number;
  finalShares: number;
  reasoning: string;
  belowMinimum: boolean;
}

export interface MultiplierTier {
  min: number;
  max: number | null;
  multiplier: number;
}

const DEFAULT_ADAPTIVE = {
  minPercent: 5,
  maxPercent: 20,
  thresholdUsd: 500,
};

export function parseTieredMultipliers(raw?: string): MultiplierTier[] | null {
  if (!raw?.trim()) return null;
  const tiers: MultiplierTier[] = [];
  for (const part of raw.split(",")) {
    const [range, multStr] = part.split(":").map((s) => s.trim());
    if (!range || !multStr) continue;
    const multiplier = parseFloat(multStr);
    if (Number.isNaN(multiplier)) continue;
    if (range.endsWith("+")) {
      tiers.push({ min: parseFloat(range.slice(0, -1)), max: null, multiplier });
    } else {
      const [minS, maxS] = range.split("-");
      tiers.push({ min: parseFloat(minS!), max: parseFloat(maxS!), multiplier });
    }
  }
  return tiers.length ? tiers.sort((a, b) => a.min - b.min) : null;
}

function tierMultiplier(tiers: MultiplierTier[] | null, notionalUsd: number): number {
  if (!tiers?.length) return 1;
  for (const t of tiers) {
    if (notionalUsd >= t.min && (t.max === null || notionalUsd < t.max)) {
      return t.multiplier;
    }
  }
  return 1;
}

function adaptivePercent(notionalUsd: number, basePercent: number, leader: LeaderConfig): number {
  const minP = leader.strategy.adaptiveMinPercent ?? DEFAULT_ADAPTIVE.minPercent;
  const maxP = leader.strategy.adaptiveMaxPercent ?? DEFAULT_ADAPTIVE.maxPercent;
  const threshold = leader.strategy.adaptiveThresholdUsd ?? DEFAULT_ADAPTIVE.thresholdUsd;
  if (notionalUsd >= threshold) {
    return Math.max(minP, basePercent * (threshold / notionalUsd));
  }
  return Math.min(maxP, basePercent * (threshold / Math.max(notionalUsd, 1)));
}

export function calculateOrderSize(
  leader: LeaderConfig,
  global: GlobalConfig,
  activity: Activity,
  store?: StateStore
): OrderSizeResult {
  const price = activity.price ?? 0;
  const leaderSize = activity.size ?? 0;
  const leaderNotional = leaderSize * price;

  let baseUsd: number;
  let reasoning: string;
  const copySize = leader.strategy.copySize;

  switch (leader.strategy.type as CopyStrategyType) {
    case "PERCENTAGE":
      baseUsd = leaderNotional * (copySize / 100);
      reasoning = `${copySize}% of $${leaderNotional.toFixed(2)} = $${baseUsd.toFixed(2)}`;
      break;
    case "FIXED":
      baseUsd = copySize;
      reasoning = `Fixed $${copySize.toFixed(2)}`;
      break;
    case "ADAPTIVE": {
      const pct = adaptivePercent(leaderNotional, copySize, leader);
      baseUsd = leaderNotional * (pct / 100);
      reasoning = `Adaptive ${pct.toFixed(1)}% of $${leaderNotional.toFixed(2)} = $${baseUsd.toFixed(2)}`;
      break;
    }
    default:
      baseUsd = leaderNotional * (copySize / 100);
      reasoning = `Default ${copySize}%`;
  }

  const tiers = parseTieredMultipliers(leader.strategy.tieredMultipliers);
  const mult = tierMultiplier(tiers, leaderNotional);
  if (mult !== 1) {
    baseUsd *= mult;
    reasoning += `; tier x${mult}`;
  }

  const maxOrder = Math.min(
    leader.limits?.maxOrderUsd ?? Infinity,
    global.risk.maxOrderUsd
  );
  if (baseUsd > maxOrder) {
    baseUsd = maxOrder;
    reasoning += `; capped at $${maxOrder}`;
  }

  if (store && activity.asset && leader.limits?.maxPositionUsd) {
    const basis = global.risk.positionCapBasis ?? "market";
    const heldUsd =
      basis === "cost"
        ? store.getPositionCostUsd(leader.id, activity.asset)
        : store.getPosition(leader.id, activity.asset) * price;
    const room = leader.limits.maxPositionUsd - heldUsd;
    if (activity.side === "BUY" && room <= 0) {
      return {
        finalUsd: 0,
        finalShares: 0,
        reasoning: `${reasoning}; max position reached`,
        belowMinimum: true,
      };
    }
    if (activity.side === "BUY" && baseUsd > room) {
      baseUsd = Math.max(0, room);
      reasoning += `; position cap $${room.toFixed(2)}`;
    }
  }

  const minOrder = global.risk.minOrderUsd;
  if (baseUsd < minOrder) {
    return {
      finalUsd: baseUsd,
      finalShares: price > 0 ? baseUsd / price : 0,
      reasoning: `${reasoning}; below min $${minOrder}`,
      belowMinimum: true,
    };
  }

  const shares = price > 0 ? baseUsd / price : leaderSize;
  const roundedShares = Math.max(0.01, Math.round(shares * 100) / 100);

  return {
    finalUsd: roundedShares * price,
    finalShares: roundedShares,
    reasoning,
    belowMinimum: false,
  };
}
