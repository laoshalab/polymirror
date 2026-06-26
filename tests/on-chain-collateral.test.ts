import { describe, expect, it } from "vitest";
import {
  canTradeWithChainFallback,
  type WalletCollateralSnapshot,
} from "../src/executor/balance.js";

/** Mirrors selection logic in fetchWalletCollateral for unit testing. */
function pickCollateral(
  clobUsd: number | null,
  chainUsd: number | null,
  clobAllowanceUsd: number | null = null,
  pusdAllowancesReady: boolean | null = null
): WalletCollateralSnapshot {
  if (clobUsd !== null && clobUsd > 0) {
    return { cashUsd: clobUsd, clobUsd, clobAllowanceUsd, chainUsd, source: "clob", pusdAllowancesReady };
  }
  if (chainUsd !== null && chainUsd > 0) {
    return { cashUsd: chainUsd, clobUsd, clobAllowanceUsd, chainUsd, source: "chain", pusdAllowancesReady };
  }
  if (clobUsd !== null) {
    return {
      cashUsd: clobUsd,
      clobUsd,
      clobAllowanceUsd,
      chainUsd,
      source: clobUsd > 0 ? "clob" : "none",
      pusdAllowancesReady,
    };
  }
  if (chainUsd !== null) {
    return {
      cashUsd: chainUsd,
      clobUsd,
      clobAllowanceUsd,
      chainUsd,
      source: chainUsd > 0 ? "chain" : "none",
      pusdAllowancesReady,
    };
  }
  return { cashUsd: null, clobUsd, clobAllowanceUsd, chainUsd, source: "none", pusdAllowancesReady };
}

describe("collateral source selection", () => {
  it("prefers CLOB when positive", () => {
    const r = pickCollateral(50, 145);
    expect(r.source).toBe("clob");
    expect(r.cashUsd).toBe(50);
  });

  it("falls back to chain when CLOB is zero", () => {
    const r = pickCollateral(0, 145.66);
    expect(r.source).toBe("chain");
    expect(r.cashUsd).toBe(145.66);
  });

  it("uses chain when CLOB unavailable", () => {
    const r = pickCollateral(null, 10);
    expect(r.source).toBe("chain");
    expect(r.cashUsd).toBe(10);
  });

  it("allows chain fallback when on-chain allowances are ready", () => {
    const snap = pickCollateral(0, 144.65, 0, true);
    expect(canTradeWithChainFallback(snap)).toBe(true);
  });

  it("blocks chain fallback without on-chain allowances", () => {
    const snap = pickCollateral(0, 144.65, 0, false);
    expect(canTradeWithChainFallback(snap)).toBe(false);
  });
});
