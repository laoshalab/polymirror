import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as stringifyYaml } from "yaml";
import {
  readNormalizedConfigDocument,
  removeLeaderFromAccount,
  writeNormalizedConfigDocument,
} from "../src/config/write.js";
import { findLeaderIdForTrader } from "../src/api/leaders.js";
import { testLeader } from "./helpers/fixtures.js";

function writeTestConfig(dir: string, leaders: Record<string, unknown>[]) {
  const path = join(dir, "config.yaml");
  writeFileSync(
    path,
    stringifyYaml({
      global: {
        preview_mode: true,
        poll_interval_ms: 5000,
        risk: {
          enable_copy_trading: true,
          daily_loss_cap_pct: 20,
          starting_capital_usd: 500,
          max_daily_volume_usd: 500,
          max_open_markets: 15,
          max_order_usd: 25,
          min_order_usd: 1,
          slippage_tolerance: 0.03,
        },
        execution: {
          order_type: "GTC",
          retry_limit: 3,
          network_retry_limit: 3,
          gtc_fill_timeout_ms: 10_000,
          pending_order_max_age_hours: 48,
        },
        conflict: { mode: "priority_leader", priority: [] },
      },
      leaders,
    }),
    "utf8"
  );
  return path;
}

describe("removeLeaderFromAccount", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pm-leader-rm-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("removes leader from config", () => {
    const path = writeTestConfig(dir, [
      { id: "a", address: "0x" + "1".repeat(40), enabled: true, strategy: { type: "PERCENTAGE", copy_size: 5 } },
      { id: "b", address: "0x" + "2".repeat(40), enabled: true, strategy: { type: "PERCENTAGE", copy_size: 5 } },
    ]);
    const normalized = readNormalizedConfigDocument(path);
    const next = removeLeaderFromAccount(normalized, "default", "a");
    writeNormalizedConfigDocument(path, next);
    const reread = readNormalizedConfigDocument(path);
    expect(reread.accounts[0]!.leaders.map((l) => l.id)).toEqual(["b"]);
    expect(readFileSync(path, "utf8")).not.toContain("id: a");
  });

  it("throws when leader missing", () => {
    const path = writeTestConfig(dir, [
      { id: "a", address: "0x" + "1".repeat(40), enabled: true, strategy: { type: "PERCENTAGE", copy_size: 5 } },
    ]);
    const normalized = readNormalizedConfigDocument(path);
    expect(() => removeLeaderFromAccount(normalized, "default", "missing")).toThrow(/not found/i);
  });
});

describe("findLeaderIdForTrader", () => {
  it("matches by address or username", () => {
    const leaders = [
      testLeader({ id: "by-addr", address: "0x" + "a".repeat(40) }),
      testLeader({ id: "by-user", address: undefined, username: "whale1" }),
    ];
    expect(findLeaderIdForTrader(leaders, "0x" + "a".repeat(40))).toBe("by-addr");
    expect(findLeaderIdForTrader(leaders, "0x" + "b".repeat(40), "whale1")).toBe("by-user");
    expect(findLeaderIdForTrader(leaders, "0x" + "c".repeat(40), "unknown")).toBeUndefined();
  });
});
