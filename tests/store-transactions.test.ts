import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../src/state/store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-store-txn-"));
  store = new StateStore(join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("StateStore transactions", () => {
  it("recordCopySuccess updates seen, position, volume, and audit together", () => {
    store.recordCopySuccess({
      tradeKey: "trade-1",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      filledShares: 10,
      price: 0.5,
      filledUsd: 5,
      auditReason: "10% copy",
      preview: false,
    });

    expect(store.hasSeen("trade-1")).toBe(true);
    expect(store.getPosition("whale", "tok-a")).toBe(10);
    expect(store.getDailyVolumeUsd()).toBe(5);
    expect(store.getLeaderDailyVolumeUsd("whale")).toBe(5);

    const audit = store.listAuditLog({ action: "COPY" });
    expect(audit.total).toBe(1);
    expect(audit.items[0]?.size).toBe(10);
  });

  it("recordCopySuccess SELL does not increment daily volume", () => {
    store.recordCopySuccess({
      tradeKey: "trade-sell",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "SELL",
      filledShares: 4,
      price: 0.6,
      filledUsd: 2.4,
      auditReason: "sell",
      preview: false,
    });

    expect(store.getDailyVolumeUsd()).toBe(0);
  });

  it("preview BUY deducts and SELL returns simulated cash", () => {
    store.ensurePreviewCash(100);
    store.recordCopySuccess({
      tradeKey: "trade-buy",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      filledShares: 10,
      price: 0.5,
      filledUsd: 5,
      auditReason: "buy",
      preview: true,
    });
    expect(store.getPreviewCashUsd()).toBe(95);
    expect(store.getPosition("whale", "tok-a")).toBe(10);

    store.recordCopySuccess({
      tradeKey: "trade-sell2",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "SELL",
      filledShares: 10,
      price: 0.6,
      filledUsd: 6,
      auditReason: "sell",
      preview: true,
    });
    expect(store.getPreviewCashUsd()).toBe(101);
    expect(store.getPosition("whale", "tok-a")).toBe(0);
  });

  it("recordRedeemSettlement clears position and credits preview cash", () => {
    store.ensurePreviewCash(100);
    store.applyCopyFill("whale", "tok-a", "BUY", 10, 0.4);
    store.adjustPreviewCash(-4);

    const ok = store.recordRedeemSettlement({
      tradeKey: "redeem-1",
      leaderId: "whale",
      tokenId: "tok-a",
      payoutUsd: 10,
      preview: true,
      auditReason: "winner redeem",
    });

    expect(ok).toBe(true);
    expect(store.getPosition("whale", "tok-a")).toBe(0);
    expect(store.getPreviewCashUsd()).toBe(106);
    expect(store.hasSeen("redeem-1")).toBe(true);
  });

  it("recordPendingFill applies partial fill atomically", () => {
    store.recordPendingFill({
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      delta: 4,
      price: 0.5,
      auditReason: "pending fill",
      preview: false,
    });

    expect(store.getPosition("whale", "tok-a")).toBe(4);
    expect(store.getDailyVolumeUsd()).toBe(2);
    expect(store.listAuditLog({ action: "COPY" }).total).toBe(1);
  });

  it("commitPendingOrderProgress updates filled_shares with fill in one transaction", () => {
    store.upsertPendingOrder({
      orderId: "ord-txn",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      size: 10,
      filledShares: 0,
      tradeKey: "key-txn",
      reasoning: "10%",
    });

    store.commitPendingOrderProgress({
      orderId: "ord-txn",
      matchedFilledShares: 4,
      fill: {
        leaderId: "whale",
        tokenId: "tok-a",
        side: "BUY",
        delta: 4,
        price: 0.5,
        auditReason: "pending fill",
        preview: false,
      },
      remove: false,
    });

    expect(store.getPosition("whale", "tok-a")).toBe(4);
    expect(store.listPendingOrders()[0]?.filledShares).toBe(4);
  });

  it("recordLiveOrderAccepted marks seen, pending, and fill atomically", () => {
    store.recordLiveOrderAccepted({
      tradeKeys: ["key-a", "key-b"],
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      orderSize: 10,
      filledShares: 4,
      filledUsd: 2,
      auditReason: "10% copy",
      orderId: "ord-live-1",
      pendingRemaining: 6,
      trackPendingGtc: true,
    });

    expect(store.hasSeen("key-a")).toBe(true);
    expect(store.hasSeen("key-b")).toBe(true);
    expect(store.getPosition("whale", "tok-a")).toBe(4);
    expect(store.countPendingOrders()).toBe(1);
    expect(store.listPendingOrders()[0]?.filledShares).toBe(4);
    expect(store.getDailyVolumeUsd()).toBe(2);
  });
});
