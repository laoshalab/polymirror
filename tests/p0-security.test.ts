import { describe, expect, it } from "vitest";
import { isDefiniteOrderRejection } from "../src/executor/clob.js";
import { assertDashboardAuthForBind, isLocalBindAddress } from "../src/api/auth.js";

describe("isDefiniteOrderRejection", () => {
  it("detects balance and validation errors", () => {
    expect(isDefiniteOrderRejection("insufficient balance")).toBe(true);
    expect(isDefiniteOrderRejection("Invalid price")).toBe(true);
    expect(isDefiniteOrderRejection("ECONNRESET")).toBe(false);
    expect(isDefiniteOrderRejection("fetch failed")).toBe(false);
  });
});

describe("assertDashboardAuthForBind", () => {
  it("allows localhost binds without token", () => {
    expect(isLocalBindAddress("127.0.0.1")).toBe(true);
    expect(() => assertDashboardAuthForBind("127.0.0.1")).not.toThrow();
  });

  it("requires token on public bind", () => {
    const prev = process.env.DASHBOARD_TOKEN;
    delete process.env.DASHBOARD_TOKEN;
    try {
      expect(() => assertDashboardAuthForBind("0.0.0.0")).toThrow(/DASHBOARD_TOKEN/);
    } finally {
      if (prev !== undefined) process.env.DASHBOARD_TOKEN = prev;
    }
  });
});
