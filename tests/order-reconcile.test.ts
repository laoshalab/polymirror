import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateStore } from "../src/state/store.js";
import { ClobExecutor } from "../src/executor/clob.js";
import {
  adoptUntrackedOpenOrders,
  RECOVERED_ORDER_LEADER,
} from "../src/engine/order-reconcile.js";

const mockListOpenOrders = vi.fn();
const mockGetOrderStatus = vi.fn();

vi.mock("../src/executor/clob.js", () => ({
  ClobExecutor: class {
    listOpenOrders = mockListOpenOrders;
    getOrderStatus = mockGetOrderStatus;
  },
}));

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pm-orphan-"));
  store = new StateStore(join(dir, "test.db"));
  mockListOpenOrders.mockReset();
  mockGetOrderStatus.mockReset();
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("adoptUntrackedOpenOrders", () => {
  it("adopts open CLOB orders into pending_orders", async () => {
    mockListOpenOrders.mockResolvedValue([
      {
        orderId: "clob-orphan-1",
        tokenId: "tok-abc",
        side: "BUY",
        price: 0.55,
        size: 20,
      },
    ]);
    mockGetOrderStatus.mockResolvedValue({
      kind: "ok",
      status: {
        sizeMatched: 5,
        originalSize: 20,
        status: "LIVE",
        terminal: false,
      },
    });

    const executor = new ClobExecutor({} as never, {} as never);
    const { adopted } = await adoptUntrackedOpenOrders(executor, store);

    expect(adopted).toBe(1);
    const rows = store.listPendingOrders();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.orderId).toBe("clob-orphan-1");
    expect(rows[0]?.leaderId).toBe(RECOVERED_ORDER_LEADER);
    expect(rows[0]?.filledShares).toBe(5);
  });

  it("skips orders already tracked", async () => {
    store.upsertPendingOrder({
      orderId: "clob-known",
      leaderId: "whale",
      tokenId: "tok-a",
      side: "BUY",
      price: 0.5,
      size: 10,
      filledShares: 0,
      tradeKey: "k1",
      reasoning: "test",
    });
    mockListOpenOrders.mockResolvedValue([
      {
        orderId: "clob-known",
        tokenId: "tok-a",
        side: "BUY",
        price: 0.5,
        size: 10,
      },
    ]);

    const executor = new ClobExecutor({} as never, {} as never);
    const { adopted } = await adoptUntrackedOpenOrders(executor, store);
    expect(adopted).toBe(0);
  });
});
