import type { PositionRow } from "../state/store.js";
import { getPublicClient } from "../sdk/public-client.js";

type BookLevel = { price?: unknown };

export interface PreviewPositionValuation {
  leaderId: string;
  tokenId: string;
  shares: number;
  avgEntryPrice: number;
  costUsd: number;
  currentPrice: number | null;
  currentValueUsd: number | null;
  unrealizedPnlUsd: number | null;
}

export interface PreviewValuation {
  localExposureUsd: number;
  simulatedPositionsValueUsd: number;
  simulatedUnrealizedPnlUsd: number;
  simulatedPricedPositionCount: number;
  simulatedUnpricedPositionCount: number;
  simulatedPositions: PreviewPositionValuation[];
}

export type PreviewPriceLookup = (tokenId: string) => Promise<number | null>;

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function cleanMoney(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function bestBidPrice(bids: BookLevel[]): number | null {
  const prices = bids
    .map((b) => finiteNumber(b.price))
    .filter((p): p is number => p !== null && p > 0);
  return prices.length ? Math.max(...prices) : null;
}

export async function fetchPreviewCurrentPrice(tokenId: string): Promise<number | null> {
  const client = await getPublicClient();
  const book = await client.fetchOrderBook({ tokenId });
  return bestBidPrice(book.bids);
}

export async function buildPreviewValuation(
  positions: PositionRow[],
  lookupPrice: PreviewPriceLookup = fetchPreviewCurrentPrice
): Promise<PreviewValuation> {
  const tokenIds = [...new Set(positions.map((p) => p.tokenId))];
  const prices = new Map<string, number | null>();

  await Promise.all(
    tokenIds.map(async (tokenId) => {
      try {
        prices.set(tokenId, await lookupPrice(tokenId));
      } catch {
        prices.set(tokenId, null);
      }
    })
  );

  let localExposureUsd = 0;
  let simulatedPositionsValueUsd = 0;
  let simulatedUnrealizedPnlUsd = 0;
  let simulatedPricedPositionCount = 0;
  let simulatedUnpricedPositionCount = 0;

  const simulatedPositions = positions.map((p) => {
    const costUsd = p.shares * p.avgEntryPrice;
    localExposureUsd += costUsd;

    const currentPrice = prices.get(p.tokenId) ?? null;
    if (currentPrice === null) {
      simulatedUnpricedPositionCount += 1;
      return {
        ...p,
        costUsd: cleanMoney(costUsd),
        currentPrice,
        currentValueUsd: null,
        unrealizedPnlUsd: null,
      };
    }

    const currentValueUsd = p.shares * currentPrice;
    const unrealizedPnlUsd = currentValueUsd - costUsd;
    simulatedPositionsValueUsd += currentValueUsd;
    simulatedUnrealizedPnlUsd += unrealizedPnlUsd;
    simulatedPricedPositionCount += 1;

    return {
      ...p,
      costUsd: cleanMoney(costUsd),
      currentPrice,
      currentValueUsd: cleanMoney(currentValueUsd),
      unrealizedPnlUsd: cleanMoney(unrealizedPnlUsd),
    };
  });

  return {
    localExposureUsd: cleanMoney(localExposureUsd),
    simulatedPositionsValueUsd: cleanMoney(simulatedPositionsValueUsd),
    simulatedUnrealizedPnlUsd: cleanMoney(simulatedUnrealizedPnlUsd),
    simulatedPricedPositionCount,
    simulatedUnpricedPositionCount,
    simulatedPositions,
  };
}
