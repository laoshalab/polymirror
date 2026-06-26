import { describe, expect, it } from "vitest";
import {
  formatGeoblockMessage,
  isGeoblockError,
} from "../src/executor/geoblock.js";

describe("isGeoblockError", () => {
  it("detects region restriction message", () => {
    expect(
      isGeoblockError(
        "Trading restricted in your region, please refer to available regions - https://docs.polymarket.com/developers/CLOB/geoblock"
      )
    ).toBe(true);
  });

  it("ignores balance errors", () => {
    expect(isGeoblockError("not enough balance / allowance")).toBe(false);
  });
});

describe("formatGeoblockMessage", () => {
  it("includes ip and country", () => {
    const msg = formatGeoblockMessage({
      blocked: true,
      ip: "1.2.3.4",
      country: "GB",
      region: "ENG",
    });
    expect(msg).toContain("1.2.3.4");
    expect(msg).toContain("GB");
  });
});
