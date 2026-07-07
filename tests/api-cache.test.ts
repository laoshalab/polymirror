import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PnL cache", () => {
  const mockFetchJson = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockFetchJson.mockReset();
    vi.doMock("../src/util/fetch.js", () => ({
      fetchJsonWithRetry: mockFetchJson,
    }));
  });

  afterEach(() => {
    vi.doUnmock("../src/util/fetch.js");
    vi.resetModules();
  });

  it("returns cached polymarket PnL within TTL", async () => {
    mockFetchJson.mockResolvedValue([{ t: 1_700_000_000_000, p: 10 }]);

    const { buildAccountPnlSnapshot, resetPnlCache } = await import("../src/api/pnl.js");
    resetPnlCache();

    const opts = {
      accountId: "acct",
      address: "0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf",
      range: "1d" as const,
    };

    const first = await buildAccountPnlSnapshot(opts);
    const second = await buildAccountPnlSnapshot(opts);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.points).toEqual(first.points);
    expect(mockFetchJson).toHaveBeenCalledTimes(2);
  });

  it("falls back to stale PnL cache when fetch fails", async () => {
    mockFetchJson
      .mockResolvedValueOnce([{ t: 1_700_000_000_000, p: 12 }])
      .mockResolvedValueOnce([{ amount: 12 }])
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"));

    const { buildAccountPnlSnapshot, resetPnlCache, PNL_CACHE_TTL_MS } = await import(
      "../src/api/pnl.js"
    );
    resetPnlCache();

    const opts = {
      accountId: "acct",
      address: "0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf",
      range: "1d" as const,
    };

    const first = await buildAccountPnlSnapshot(opts);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + PNL_CACHE_TTL_MS + 1);

    const second = await buildAccountPnlSnapshot(opts);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.points).toEqual(first.points);
    expect(second.error).toBeUndefined();

    vi.spyOn(Date, "now").mockRestore();
  });
});

describe("trader detail cache", () => {
  const mockFirstPage = vi.fn();
  const mockFetchProfile = vi.fn();
  const mockGetActivity = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockFirstPage.mockReset();
    mockFetchProfile.mockReset();
    mockGetActivity.mockReset();
    vi.doMock("../src/sdk/public-client.js", () => ({
      getPublicClient: vi.fn(async () => ({
        listTraderLeaderboard: vi.fn(() => ({ firstPage: mockFirstPage })),
        fetchPublicProfile: mockFetchProfile,
      })),
    }));
    vi.doMock("../src/monitor/data-api.js", () => ({
      getActivity: mockGetActivity,
    }));
  });

  afterEach(() => {
    vi.doUnmock("../src/sdk/public-client.js");
    vi.doUnmock("../src/monitor/data-api.js");
    vi.resetModules();
  });

  const address = "0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf";

  function mockTraderSources() {
    mockGetActivity.mockResolvedValue([
      {
        timestamp: Date.now(),
        type: "TRADE",
        side: "BUY",
        size: 5,
        price: 0.5,
      },
    ]);
    mockFirstPage.mockResolvedValue({
      items: [{ wallet: address, userName: "whale", pnl: "100", vol: "1000", rank: "1" }],
    });
    mockFetchProfile.mockResolvedValue({
      name: "whale",
      profileImage: "https://example.com/a.png",
    });
  }

  it("returns cached trader detail within TTL", async () => {
    mockTraderSources();

    const { fetchTraderDetail, resetTraderDetailCache } = await import("../src/api/discover.js");
    resetTraderDetailCache();

    const first = await fetchTraderDetail(address);
    const second = await fetchTraderDetail(address);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.detail).toEqual(first.detail);
    expect(mockGetActivity).toHaveBeenCalledTimes(1);
    expect(mockFetchProfile).toHaveBeenCalledTimes(1);
  });

  it("falls back to stale trader detail when fetch fails", async () => {
    mockTraderSources();

    const { fetchTraderDetail, resetTraderDetailCache, TRADER_DETAIL_CACHE_TTL_MS } =
      await import("../src/api/discover.js");
    resetTraderDetailCache();

    const first = await fetchTraderDetail(address);
    mockGetActivity.mockRejectedValue(new Error("fetch failed"));
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + TRADER_DETAIL_CACHE_TTL_MS + 1);

    const second = await fetchTraderDetail(address);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.detail).toEqual(first.detail);

    vi.spyOn(Date, "now").mockRestore();
  });
});
