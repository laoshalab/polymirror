import { describe, it, expect } from "vitest";
import { proportionalSellable } from "../src/executor/balance.js";

describe("proportionalSellable", () => {
  it("allocates wallet balance proportionally across leaders", () => {
    expect(proportionalSellable(10, 12, 15)).toBe(8);
  });

  it("caps at leader held when wallet is sufficient", () => {
    expect(proportionalSellable(5, 100, 10)).toBe(5);
  });

  it("returns 0 when wallet empty", () => {
    expect(proportionalSellable(10, 0, 10)).toBe(0);
  });

  it("uses wallet directly when no tracked total", () => {
    expect(proportionalSellable(10, 8, 0)).toBe(8);
  });
});
