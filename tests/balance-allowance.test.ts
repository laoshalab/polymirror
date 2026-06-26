import { describe, expect, it } from "vitest";
import {
  checkLiveBuyCollateralAndAllowance,
  parseClobAllowanceUsd,
} from "../src/executor/balance.js";

describe("parseClobAllowanceUsd", () => {
  it("returns max allowance across spenders", () => {
    expect(
      parseClobAllowanceUsd({
        a: "1000000",
        b: "50000000",
      })
    ).toBe(50);
  });

  it("returns 0 when allowances missing", () => {
    expect(parseClobAllowanceUsd(undefined)).toBe(0);
  });
});

describe("checkLiveBuyCollateralAndAllowance", () => {
  it("blocks when allowance below required", () => {
    const r = checkLiveBuyCollateralAndAllowance(100, 5, 10, 1);
    expect(r.allow).toBe(false);
    expect(r.reason).toContain("allowance");
  });

  it("allows when balance and allowance sufficient", () => {
    const r = checkLiveBuyCollateralAndAllowance(100, 100, 10, 1);
    expect(r.allow).toBe(true);
  });
});
