import { describe, expect, it } from "vitest";
import {
  isValidProxyUrl,
  maskProxyUrl,
  resolveProxyConfig,
  setProxyConfig,
  getEffectiveProxyUrl,
} from "../src/util/proxy.js";

describe("proxy", () => {
  it("validates proxy URLs", () => {
    expect(isValidProxyUrl("http://127.0.0.1:7890")).toBe(true);
    expect(isValidProxyUrl("http://user:pass@host:8080")).toBe(true);
    expect(isValidProxyUrl("not-a-url")).toBe(false);
  });

  it("masks credentials in proxy URL", () => {
    expect(maskProxyUrl("http://user:secret@1.2.3.4:8080")).toContain("****");
    expect(maskProxyUrl("http://user:secret@1.2.3.4:8080")).not.toContain("secret");
  });

  it("resolves static config from yaml", () => {
    const { config, source } = resolveProxyConfig({
      mode: "static",
      staticUrl: "http://127.0.0.1:7890",
    });
    expect(config.mode).toBe("static");
    expect(config.staticUrl).toBe("http://127.0.0.1:7890");
    expect(source).toBe("yaml");
  });

  it("appends session for dynamic rotate", () => {
    setProxyConfig(
      {
        mode: "dynamic",
        dynamicUrl: "http://proxy.example.com:8080",
        dynamicRotateSession: true,
      },
      "yaml"
    );
    const url = getEffectiveProxyUrl(true);
    expect(url).toMatch(/^http:\/\/proxy\.example\.com:8080/);
    expect(url).toMatch(/session=/);
  });
});
