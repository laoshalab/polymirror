import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StateStore } from "../src/state/store.js";
import { runCopyCycle } from "../src/engine/copy-cycle.js";
import { pollLeaders } from "../src/monitor/poll.js";
import { tradeEventKey } from "../src/monitor/data-api.js";
import { previewRuntimeConfig, testActivity, testLeader } from "./helpers/fixtures.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../src/monitor/poll.js", () => ({
  pollLeaders: vi.fn(),
}));

const mockPollLeaders = vi.mocked(pollLeaders);

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-copy-cycle-"));
  store = new StateStore(join(dir, "test.db"));
  mockPollLeaders.mockReset();
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runCopyCycle", () => {
  it("copies a preview trade from mocked Data API poll", async () => {
    const activity = testActivity();
    const config = previewRuntimeConfig();

    mockPollLeaders.mockResolvedValue([
      { leaderId: "whale", fetched: 1, candidates: [activity] },
    ]);

    const result = await runCopyCycle(config, store);

    expect(result.copied).toBe(1);
    expect(result.errors).toEqual([]);
    expect(store.getPosition("whale", activity.asset!)).toBe(10);
    expect(store.hasSeen(tradeEventKey(activity))).toBe(true);
    expect(store.getDailyVolumeUsd()).toBe(5);
  });

  it("skips already-seen trades on the next cycle", async () => {
    const activity = testActivity();
    const config = previewRuntimeConfig();

    mockPollLeaders.mockResolvedValue([
      { leaderId: "whale", fetched: 1, candidates: [activity] },
    ]);

    await runCopyCycle(config, store);
    const second = await runCopyCycle(config, store);

    expect(second.copied).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
  });

  it("skips trades that fail leader filters", async () => {
    const activity = testActivity({ price: 0.01 });
    const config = previewRuntimeConfig();

    mockPollLeaders.mockResolvedValue([
      { leaderId: "whale", fetched: 1, candidates: [activity] },
    ]);

    const result = await runCopyCycle(config, store);

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(store.getPosition("whale", activity.asset!)).toBe(0);
  });

  it("records poll errors without crashing", async () => {
    const config = previewRuntimeConfig();

    mockPollLeaders.mockResolvedValue([
      { leaderId: "whale", fetched: 0, candidates: [], error: "network timeout" },
    ]);

    const result = await runCopyCycle(config, store);

    expect(result.copied).toBe(0);
    expect(result.errors.some((e) => e.includes("network timeout"))).toBe(true);
  });

  it("respects disabled leader config", async () => {
    const activity = testActivity();
    const config = previewRuntimeConfig([testLeader({ enabled: false })]);

    mockPollLeaders.mockResolvedValue([
      { leaderId: "whale", fetched: 1, candidates: [activity] },
    ]);

    const result = await runCopyCycle(config, store);

    expect(result.copied).toBe(0);
  });
});
