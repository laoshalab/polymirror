import { describe, expect, it } from "vitest";
import { formatPriceForTick, roundToTick } from "../src/executor/orderbook.js";

describe("roundToTick", () => {
  it("snaps to 0.001 tick without float artifacts", () => {
    expect(roundToTick(0.1234, 0.001)).toBe(0.123);
    expect(formatPriceForTick(0.1234, 0.001)).toBe("0.123");
  });

  it("respects 0.01 tick decimals", () => {
    expect(roundToTick(0.4567, 0.01)).toBe(0.46);
    expect(formatPriceForTick(0.4567, "0.01")).toBe("0.46");
  });

  it("clamps to valid probability range", () => {
    expect(roundToTick(0.0001, 0.001)).toBe(0.001);
    expect(roundToTick(1, 0.001)).toBe(0.999);
  });
});
