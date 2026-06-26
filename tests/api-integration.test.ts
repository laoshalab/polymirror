import { describe, expect, it } from "vitest";
import { assertLiveTradingAllowed, assertLiveTradingForAccounts } from "../src/engine/risk.js";
import { patchGlobalSettings } from "../src/api/settings.js";
import type { ApiContext } from "../src/api/routes.js";
import type { AccountApiContext } from "../src/accounts/manager.js";

describe("assertLiveTradingAllowed", () => {
  it("allows preview mode without confirm env", () => {
    expect(() => assertLiveTradingAllowed(true)).not.toThrow();
  });

  it("blocks live trading without POLYMIRROR_LIVE_CONFIRM", () => {
    const prevConfirm = process.env.POLYMIRROR_LIVE_CONFIRM;
    const prevRequire = process.env.REQUIRE_LIVE_CONFIRM;
    delete process.env.POLYMIRROR_LIVE_CONFIRM;
    process.env.REQUIRE_LIVE_CONFIRM = "true";
    try {
      expect(() => assertLiveTradingAllowed(false)).toThrow(/I_UNDERSTAND_LIVE_TRADING/);
    } finally {
      if (prevConfirm !== undefined) process.env.POLYMIRROR_LIVE_CONFIRM = prevConfirm;
      else delete process.env.POLYMIRROR_LIVE_CONFIRM;
      if (prevRequire !== undefined) process.env.REQUIRE_LIVE_CONFIRM = prevRequire;
      else delete process.env.REQUIRE_LIVE_CONFIRM;
    }
  });

  it("allows live when confirm env is set", () => {
    const prevConfirm = process.env.POLYMIRROR_LIVE_CONFIRM;
    const prevRequire = process.env.REQUIRE_LIVE_CONFIRM;
    process.env.POLYMIRROR_LIVE_CONFIRM = "I_UNDERSTAND_LIVE_TRADING";
    process.env.REQUIRE_LIVE_CONFIRM = "true";
    try {
      expect(() => assertLiveTradingAllowed(false)).not.toThrow();
    } finally {
      if (prevConfirm !== undefined) process.env.POLYMIRROR_LIVE_CONFIRM = prevConfirm;
      else delete process.env.POLYMIRROR_LIVE_CONFIRM;
      if (prevRequire !== undefined) process.env.REQUIRE_LIVE_CONFIRM = prevRequire;
      else delete process.env.REQUIRE_LIVE_CONFIRM;
    }
  });
});

describe("assertLiveTradingForAccounts", () => {
  it("blocks when any account is live without confirm", () => {
    const prevConfirm = process.env.POLYMIRROR_LIVE_CONFIRM;
    const prevRequire = process.env.REQUIRE_LIVE_CONFIRM;
    delete process.env.POLYMIRROR_LIVE_CONFIRM;
    process.env.REQUIRE_LIVE_CONFIRM = "true";
    try {
      expect(() =>
        assertLiveTradingForAccounts([
          { config: { app: { global: { previewMode: true } } } },
          { config: { app: { global: { previewMode: false } } } },
        ])
      ).toThrow(/I_UNDERSTAND_LIVE_TRADING/);
    } finally {
      if (prevConfirm !== undefined) process.env.POLYMIRROR_LIVE_CONFIRM = prevConfirm;
      else delete process.env.POLYMIRROR_LIVE_CONFIRM;
      if (prevRequire !== undefined) process.env.REQUIRE_LIVE_CONFIRM = prevRequire;
      else delete process.env.REQUIRE_LIVE_CONFIRM;
    }
  });
});

describe("patchGlobalSettings live gate", () => {
  const mockRoot = {
    configPath: "/tmp/unused-config.yaml",
    reloadConfig: async () => {},
    manager: {
      buildAccountsSummary: () => [],
      list: () => [],
    },
  } as unknown as ApiContext;

  const mockActx = {
    accountId: "main",
  } as AccountApiContext;

  it("rejects previewMode:false without live confirm", async () => {
    const prevConfirm = process.env.POLYMIRROR_LIVE_CONFIRM;
    const prevRequire = process.env.REQUIRE_LIVE_CONFIRM;
    delete process.env.POLYMIRROR_LIVE_CONFIRM;
    process.env.REQUIRE_LIVE_CONFIRM = "true";
    try {
      const result = await patchGlobalSettings(mockRoot, mockActx, { previewMode: false });
      expect(result.status).toBe(400);
      expect(String((result.body as { error?: string }).error)).toMatch(/I_UNDERSTAND_LIVE_TRADING/);
    } finally {
      if (prevConfirm !== undefined) process.env.POLYMIRROR_LIVE_CONFIRM = prevConfirm;
      else delete process.env.POLYMIRROR_LIVE_CONFIRM;
      if (prevRequire !== undefined) process.env.REQUIRE_LIVE_CONFIRM = prevRequire;
      else delete process.env.REQUIRE_LIVE_CONFIRM;
    }
  });
});
