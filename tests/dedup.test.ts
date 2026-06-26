import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../src/state/store.js";
import { isAlreadyProcessed, isAnyTradeKeySeen, isRecentBuyDuplicate } from "../src/engine/dedup.js";
import type { Activity } from "../src/monitor/data-api.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;
let store: StateStore;

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    type: "TRADE",
    asset: "tok",
    side: "BUY",
    size: 10,
    price: 0.5,
    timestamp: Date.now(),
    transactionHash: "0xabc",
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-test-"));
  store = new StateStore(join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("dedup", () => {
  it("detects seen trades", () => {
    const a = activity();
    expect(isAlreadyProcessed(store, a)).toBe(false);
    store.markSeen("key1", "whale");
    store.markSeen("key1", "whale");
    expect(store.hasSeen("key1")).toBe(true);
  });

  it("blocks recent buy duplicate", () => {
    const a = activity();
    store.recordBuy("whale", "tok");
    expect(isRecentBuyDuplicate(store, "whale", a, 60000)).toBe(true);
    expect(isRecentBuyDuplicate(store, "other", a, 60000)).toBe(false);
  });

  it("detects any aggregated trade key as seen", () => {
    store.markSeen("key-a", "whale");
    expect(isAnyTradeKeySeen(store, ["key-a", "key-b"])).toBe(true);
    expect(isAnyTradeKeySeen(store, ["key-b", "key-c"])).toBe(false);
  });
});
