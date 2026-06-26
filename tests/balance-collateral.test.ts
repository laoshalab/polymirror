import { describe, it, expect } from "vitest";
import { checkLiveBuyCollateral } from "../src/executor/balance.js";

describe("checkLiveBuyCollateral", () => {
  it("blocks when balance unavailable", () => {
    const r = checkLiveBuyCollateral(null, 10, 1);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/unavailable/i);
  });

  it("blocks when below min order", () => {
    const r = checkLiveBuyCollateral(0.5, 10, 1);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/below min/i);
  });

  it("blocks when insufficient for notional", () => {
    const r = checkLiveBuyCollateral(5, 10, 1);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/need/i);
  });

  it("allows when cash covers notional", () => {
    const r = checkLiveBuyCollateral(25, 10, 1);
    expect(r.allow).toBe(true);
    expect(r.cashUsd).toBe(25);
  });
});
