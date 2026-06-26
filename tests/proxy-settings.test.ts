import { describe, expect, it } from "vitest";
import { validateProxyPatch } from "../src/config/settings-schema.js";

describe("validateProxyPatch", () => {
  const defaults = {
    proxy: { mode: "none", static_url: "", dynamic_url: "", dynamic_rotate_session: true },
  };

  it("requires URL for static mode", () => {
    expect(() => validateProxyPatch({ mode: "static" }, defaults)).toThrow(/固定/);
  });

  it("accepts existing static URL when patch omits url", () => {
    expect(() =>
      validateProxyPatch(
        { mode: "static" },
        { proxy: { mode: "static", static_url: "http://127.0.0.1:7890", dynamic_url: "" } }
      )
    ).not.toThrow();
  });

  it("rejects invalid URL", () => {
    expect(() =>
      validateProxyPatch({ mode: "static", staticUrl: "not-a-url" }, defaults)
    ).toThrow(/无效/);
  });
});
