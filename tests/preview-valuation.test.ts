import { describe, expect, it } from "vitest";
import {
  bestBidPrice,
  buildPreviewValuation,
} from "../src/api/preview-valuation.js";

describe("preview valuation", () => {
  it("uses the highest positive bid as the simulated exit price", () => {
    expect(
      bestBidPrice([
        { price: "0.42" },
        { price: "0.57" },
        { price: "0" },
      ])
    ).toBe(0.57);
  });

  it("marks local preview positions to market and excludes unpriced tokens from pnl", async () => {
    const valuation = await buildPreviewValuation(
      [
        { leaderId: "a", tokenId: "tok-1", shares: 10, avgEntryPrice: 0.4 },
        { leaderId: "a", tokenId: "tok-2", shares: 20, avgEntryPrice: 0.7 },
        { leaderId: "b", tokenId: "tok-1", shares: 5, avgEntryPrice: 0.5 },
      ],
      async (tokenId) => {
        if (tokenId === "tok-1") return 0.6;
        return null;
      }
    );

    expect(valuation.localExposureUsd).toBe(20.5);
    expect(valuation.simulatedPositionsValueUsd).toBe(9);
    expect(valuation.simulatedUnrealizedPnlUsd).toBe(2.5);
    expect(valuation.simulatedPricedPositionCount).toBe(2);
    expect(valuation.simulatedUnpricedPositionCount).toBe(1);
  });
});
