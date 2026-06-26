import { describe, expect, it } from "vitest";
import {
  extractOrderIdFromPostResponse,
  extractPostOrderError,
  parseCancelResponse,
} from "../src/executor/clob.js";

describe("extractOrderIdFromPostResponse", () => {
  it("reads orderID", () => {
    expect(extractOrderIdFromPostResponse({ orderID: "0xabc" })).toBe("0xabc");
  });

  it("reads order_id (V2 snake_case)", () => {
    expect(extractOrderIdFromPostResponse({ order_id: "0xdef" })).toBe("0xdef");
  });

  it("treats empty orderID as missing", () => {
    expect(extractOrderIdFromPostResponse({ orderID: "", success: true })).toBeUndefined();
  });
});

describe("extractPostOrderError", () => {
  it("returns errorMsg when set", () => {
    expect(
      extractPostOrderError({ success: true, errorMsg: "not enough balance / allowance" })
    ).toBe("not enough balance / allowance");
  });

  it("returns undefined when success with empty errorMsg", () => {
    expect(extractPostOrderError({ success: true, errorMsg: "", orderID: "0x1" })).toBeUndefined();
  });
});

describe("parseCancelResponse", () => {
  it("treats empty object as success", () => {
    expect(parseCancelResponse({})).toEqual({ ok: true });
  });

  it("returns error when errorMsg is set", () => {
    expect(parseCancelResponse({ errorMsg: "order not found" })).toEqual({
      ok: false,
      error: "order not found",
    });
  });

  it("returns error when success is false", () => {
    expect(parseCancelResponse({ success: false })).toEqual({
      ok: false,
      error: "Cancel rejected by CLOB",
    });
  });
});
