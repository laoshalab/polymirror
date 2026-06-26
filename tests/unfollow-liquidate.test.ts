import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateStore } from "../src/state/store.js";
import {
  buildUnfollowMessage,
  liquidateLeaderPositions,
} from "../src/engine/unfollow-liquidate.js";
import { previewRuntimeConfig } from "./helpers/fixtures.js";

describe("buildUnfollowMessage", () => {
  it("includes liquidation summary", () => {
    const msg = buildUnfollowMessage(
      "whale",
      { cancelled: 1, failed: 0 },
      { attempted: 2, closed: 1, pending: 1, skipped: 0, failed: 0, errors: [] },
      0
    );
    expect(msg).toContain("whale");
    expect(msg).toContain("已撤销 1 笔挂单");
    expect(msg).toContain("已卖出 1 条持仓");
    expect(msg).toContain("卖单挂单中");
  });

  it("reports remaining positions", () => {
    const msg = buildUnfollowMessage(
      "whale",
      { cancelled: 0, failed: 0 },
      { attempted: 1, closed: 0, pending: 0, skipped: 0, failed: 1, errors: ["x"] },
      2
    );
    expect(msg).toContain("未能卖出");
    expect(msg).toContain("仍有 2 条本地跟踪持仓未清空");
  });
});

describe("liquidateLeaderPositions", () => {
  let dir: string;
  let store: StateStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pm-unfollow-liq-"));
    store = new StateStore(join(dir, "test.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sells preview positions and clears local tracking", async () => {
    store.applyCopyFill("whale", "token-abc", "BUY", 10, 0.5);

    const config = previewRuntimeConfig();
    const result = await liquidateLeaderPositions(config, store, "whale");

    expect(result.attempted).toBe(1);
    expect(result.closed).toBe(1);
    expect(store.getPosition("whale", "token-abc")).toBe(0);

    const audits = store.listAuditLog({ limit: 10, offset: 0, leaderId: "whale" }).items;
    expect(audits.some((a) => a.action === "COPY" && a.side === "SELL")).toBe(true);
  });

  it("skips positions below min order notional", async () => {
    store.applyCopyFill("whale", "token-tiny", "BUY", 1, 0.1);

    const config = previewRuntimeConfig();
    config.app.global.risk.minOrderUsd = 5;

    const result = await liquidateLeaderPositions(config, store, "whale");

    expect(result.skipped).toBe(1);
    expect(store.getPosition("whale", "token-tiny")).toBe(1);
  });

  it("returns empty result when no positions", async () => {
    const config = previewRuntimeConfig();
    const result = await liquidateLeaderPositions(config, store, "whale");
    expect(result.attempted).toBe(0);
  });
});
