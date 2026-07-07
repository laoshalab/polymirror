import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildActivityUrl, mapRawActivityItem } from "../src/monitor/data-api.js";

describe("mapRawActivityItem", () => {
  it("maps a normal CLOB trade without outcomeIndex", () => {
    const activity = mapRawActivityItem({
      type: "TRADE",
      proxyWallet: "0xabc",
      timestamp: 1_700_000_000,
      transactionHash: "0xtx",
      asset: "1234567890123456789012345678901234567890123456789012345678901234",
      side: "BUY",
      size: 10,
      usdcSize: 5,
      price: 0.5,
      title: "Test market",
    });

    expect(activity).toMatchObject({
      type: "TRADE",
      asset: expect.stringContaining("1234"),
      side: "BUY",
      size: 10,
      price: 0.5,
    });
    expect(activity?.outcomeIndex).toBeUndefined();
  });

  it("skips combo trades (outcomeIndex 999 sentinel)", () => {
    expect(
      mapRawActivityItem({
        type: "TRADE",
        proxyWallet: "0xabc",
        timestamp: 1,
        asset: "combo-position-id",
        side: "BUY",
        size: 1,
        price: 0.5,
        outcomeIndex: 999,
      })
    ).toBeNull();
  });

  it("skips explicit combo trades", () => {
    expect(
      mapRawActivityItem({
        type: "TRADE",
        proxyWallet: "0xabc",
        timestamp: 1,
        isCombo: true,
        asset: "combo-position-id",
        side: "SELL",
        size: 1,
        price: 0.5,
      })
    ).toBeNull();
  });

  it("maps REDEEM activity with asset and usdcSize", () => {
    const activity = mapRawActivityItem({
      type: "REDEEM",
      proxyWallet: "0xabc",
      timestamp: 1_700_000_000,
      transactionHash: "0xredeem",
      asset: "token-redeem",
      size: 12,
      usdcSize: 12,
    });

    expect(activity).toMatchObject({
      type: "REDEEM",
      asset: "token-redeem",
      size: 12,
      usdcSize: 12,
    });
  });
});

describe("buildActivityUrl", () => {
  it("builds data-api activity query", () => {
    const url = buildActivityUrl("https://data-api.polymarket.com", {
      user: "0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf",
      limit: 10,
      type: "TRADE",
      sortBy: "TIMESTAMP",
      sortDirection: "DESC",
    });

    expect(url).toBe(
      "https://data-api.polymarket.com/activity?user=0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf&limit=10&type=TRADE&sortBy=TIMESTAMP&sortDirection=DESC"
    );
  });
});

describe("getActivity cache", () => {
  const mockFirstPage = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    mockFirstPage.mockReset();
    vi.doMock("../src/sdk/public-client.js", () => ({
      getPublicClient: vi.fn(async () => ({
        listActivity: vi.fn(() => ({
          firstPage: mockFirstPage,
        })),
      })),
    }));
  });

  afterEach(async () => {
    vi.doUnmock("../src/sdk/public-client.js");
    vi.resetModules();
  });

  it("returns cached activity within TTL without refetching", async () => {
    const trade = {
      type: "TRADE",
      wallet: "0xabc",
      timestamp: 1_700_000_000,
      transactionHash: "0xtx",
      tokenId: "1234567890123456789012345678901234567890123456789012345678901234",
      side: "BUY",
      shares: "10",
      amount: "5",
      price: "0.5",
    };
    mockFirstPage.mockResolvedValue({ items: [trade] });

    const { getActivity, resetActivityCache } = await import("../src/monitor/data-api.js");
    resetActivityCache();

    const params = {
      user: "0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf",
      limit: 10,
      type: "TRADE" as const,
    };

    const first = await getActivity("", params);
    const second = await getActivity("", params);

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(mockFirstPage).toHaveBeenCalledTimes(1);
  });

  it("falls back to stale cache when fetch fails", async () => {
    const trade = {
      type: "TRADE",
      wallet: "0xabc",
      timestamp: 1_700_000_000,
      transactionHash: "0xtx",
      tokenId: "1234567890123456789012345678901234567890123456789012345678901234",
      side: "BUY",
      shares: "10",
      amount: "5",
      price: "0.5",
    };
    mockFirstPage
      .mockResolvedValueOnce({ items: [trade] })
      .mockRejectedValueOnce(new Error("fetch failed"));

    const { getActivity, resetActivityCache, ACTIVITY_CACHE_TTL_MS } = await import(
      "../src/monitor/data-api.js"
    );
    resetActivityCache();

    const params = {
      user: "0xc4d5a24a240ec9f52669e3251e0473fd0c5687cf",
      limit: 10,
      type: "TRADE" as const,
    };

    const first = await getActivity("", params);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + ACTIVITY_CACHE_TTL_MS + 1);

    const second = await getActivity("", params);

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(mockFirstPage).toHaveBeenCalledTimes(2);

    vi.spyOn(Date, "now").mockRestore();
  });
});
