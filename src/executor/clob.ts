import type { WalletConfig, GlobalConfig } from "../config/types.js";
import type { TradeSide } from "../config/types.js";
import {
  fetchOrderBookMeta,
  roundToTick,
  toOrderType,
} from "./orderbook.js";
import { createTradingBackend, type TradingBackend } from "./trading-backend.js";
import { logError, logInfo } from "../notify/logger.js";
import { OrderType } from "@polymarket/client";

export interface PlaceOrderRequest {
  tokenId: string;
  side: TradeSide;
  price: number;
  size: number;
}

export interface PlaceOrderResult {
  orderId?: string;
  preview: boolean;
  error?: string;
  filledShares: number;
  filledUsd: number;
  orderStatus?: string;
  /** Shares still resting on CLOB (GTC only). */
  pendingRemaining: number;
}

export interface OrderStatusSnapshot {
  sizeMatched: number;
  originalSize: number;
  status: string;
  terminal: boolean;
}

export type OrderStatusResult =
  | { kind: "ok"; status: OrderStatusSnapshot }
  | { kind: "not_found" }
  | { kind: "transient"; message: string };

/** Parse CLOB POST /order body (V1 orderID or V2 order_id; empty string = missing). */
export function extractOrderIdFromPostResponse(resp: unknown): string | undefined {
  if (!resp || typeof resp !== "object") return undefined;
  const r = resp as Record<string, unknown>;
  for (const key of ["orderID", "order_id", "orderId", "id"]) {
    const v = r[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

export function extractPostOrderError(resp: unknown): string | undefined {
  if (!resp || typeof resp !== "object") return undefined;
  const r = resp as Record<string, unknown>;
  if (r.ok === false && typeof r.message === "string" && r.message.trim()) {
    return r.message.trim();
  }
  const msg = String(r.errorMsg ?? r.error ?? "").trim();
  if (msg) return msg;
  if (r.success === false) return "Order rejected by CLOB";
  return undefined;
}

/** Parse CLOB cancel/delete response (client default throwOnError is false). */
export function parseCancelResponse(raw: unknown): { ok: boolean; error?: string } {
  if (!raw || typeof raw !== "object") return { ok: true };
  const r = raw as Record<string, unknown>;
  const msg = String(r.errorMsg ?? r.error ?? "").trim();
  if (msg) return { ok: false, error: msg };
  if (r.success === false) return { ok: false, error: "Cancel rejected by CLOB" };
  if (r.canceled === false) return { ok: false, error: "Order was not canceled" };
  return { ok: true };
}

export class ClobExecutor {
  private readonly backend: TradingBackend;

  constructor(
    private readonly wallet: WalletConfig,
    private readonly global: GlobalConfig
  ) {
    this.backend = createTradingBackend(wallet);
  }

  async placeLimitOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
    const notional = req.price * req.size;

    if (this.global.previewMode) {
      return {
        preview: true,
        orderId: `preview-${req.tokenId.slice(0, 8)}-${Date.now()}`,
        filledShares: req.size,
        filledUsd: notional,
        orderStatus: "PREVIEW",
        pendingRemaining: 0,
      };
    }

    const meta = await fetchOrderBookMeta(
      this.wallet.clobUrl,
      this.wallet.chainId,
      req.tokenId
    );
    if (!meta) {
      return {
        preview: false,
        error: `Order book unavailable for ${req.tokenId.slice(0, 12)}`,
        filledShares: 0,
        filledUsd: 0,
        pendingRemaining: 0,
      };
    }

    const tick = parseFloat(meta.tickSize);
    const price = roundToTick(req.price, tick);
    const orderType = toOrderType(this.global.execution.orderType);
    const retries = this.global.execution.retryLimit;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const submitted = await this.backend.submitOrder({
          tokenId: req.tokenId,
          side: req.side,
          price,
          size: req.size,
          orderType: this.global.execution.orderType,
          tickSize: meta.tickSize,
          negRisk: meta.negRisk,
        });

        const postError = submitted.error ?? extractPostOrderError(submitted.raw);
        if (postError) {
          return {
            preview: false,
            error: postError,
            filledShares: 0,
            filledUsd: 0,
            pendingRemaining: 0,
          };
        }

        const immediate = {
          takingAmount: submitted.takingAmount,
          makingAmount: submitted.makingAmount,
          status: submitted.status,
        };
        let orderId = submitted.orderId ?? extractOrderIdFromPostResponse(submitted.raw);

        if (!orderId) {
          const immFill = parseImmediateFill(immediate, req.side, price);
          if (immFill.shares > 0) {
            const shares = Math.min(immFill.shares, req.size);
            const pendingRemaining = Math.max(
              0,
              Math.round((req.size - shares) * 100) / 100
            );
            if (pendingRemaining > 0) {
              const recovered = await this.findMatchingOpenOrder(req, price);
              if (recovered?.orderId) return recovered;
              return {
                preview: false,
                error: "Partial fill without order ID — cannot track remaining GTC",
                filledShares: shares,
                filledUsd:
                  immFill.usd > 0 ? immFill.usd : Math.round(shares * price * 100) / 100,
                orderStatus: immFill.status || immediate.status || "matched",
                pendingRemaining: 0,
              };
            }
            return {
              preview: false,
              filledShares: shares,
              filledUsd:
                immFill.usd > 0 ? immFill.usd : Math.round(shares * price * 100) / 100,
              orderStatus: immFill.status || immediate.status || "matched",
              pendingRemaining: 0,
            };
          }

          const recovered = await this.findMatchingOpenOrder(req, price);
          if (recovered) return recovered;

          logError("Order response missing order id", {
            token: req.tokenId.slice(0, 12),
            status: immediate.status,
            response: JSON.stringify(submitted.raw).slice(0, 400),
          });
          return {
            preview: false,
            error: "Order accepted but no order ID returned",
            filledShares: 0,
            filledUsd: 0,
            pendingRemaining: 0,
          };
        }

        const fill = await this.resolveFill(
          orderId,
          req,
          price,
          orderType,
          immediate
        );

        return {
          preview: false,
          orderId,
          filledShares: fill.shares,
          filledUsd: fill.usd,
          orderStatus: fill.status,
          pendingRemaining: fill.remaining,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < retries) {
          const recovered = await this.findMatchingOpenOrder(req, price);
          if (recovered) return recovered;
          await sleep(500 * (attempt + 1));
          continue;
        }
        logError("Order failed", { token: req.tokenId.slice(0, 12), error: msg });
        return {
          preview: false,
          error: msg,
          filledShares: 0,
          filledUsd: 0,
          pendingRemaining: 0,
        };
      }
    }

    return {
      preview: false,
      error: "Order failed after retries",
      filledShares: 0,
      filledUsd: 0,
      pendingRemaining: 0,
    };
  }

  async getOrderStatus(orderId: string, tokenId?: string): Promise<OrderStatusResult> {
    return this.backend.getOrderStatus(orderId, tokenId);
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.global.previewMode) {
      return { ok: true };
    }
    try {
      const parsed = await this.backend.cancelOrder(orderId);
      if (!parsed.ok) {
        logError("Cancel order rejected", {
          orderId: orderId.slice(0, 12),
          error: parsed.error,
        });
      }
      return parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logError("Cancel order failed", { orderId: orderId.slice(0, 12), error: msg });
      return { ok: false, error: msg };
    }
  }

  /** After a failed submit, look for a matching resting order on CLOB (timeout / lost response). */
  async recoverOrderAfterFailure(
    req: PlaceOrderRequest,
    expectedPrice?: number
  ): Promise<PlaceOrderResult | null> {
    return this.findMatchingOpenOrder(req, expectedPrice);
  }

  /** List all open orders on CLOB (live only). */
  async listOpenOrders(): Promise<
    Array<{ orderId: string; tokenId: string; side: string; price: number; size: number }>
  > {
    if (this.global.previewMode) return [];
    try {
      return await this.backend.listOpenOrders();
    } catch (e) {
      logError("List open orders failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  private async findMatchingOpenOrder(
    req: PlaceOrderRequest,
    expectedPrice?: number
  ): Promise<PlaceOrderResult | null> {
    try {
      let matchPrice = expectedPrice;
      let priceTol = 0.0001;
      if (matchPrice === undefined) {
        const meta = await fetchOrderBookMeta(
          this.wallet.clobUrl,
          this.wallet.chainId,
          req.tokenId
        );
        if (meta) {
          const tick = parseFloat(meta.tickSize);
          matchPrice = roundToTick(req.price, tick);
          priceTol = Math.max(tick / 2, 0.0001);
        } else {
          matchPrice = req.price;
        }
      }

      const open = await this.backend.listOpenOrders({ tokenId: req.tokenId });
      if (open.length === 0) return null;

      const side = req.side;
      for (const row of open) {
        const { orderId, side: orderSide, price, size: originalSize } = row;
        if (!orderId) continue;
        if (orderSide !== side) continue;
        if (Math.abs(price - matchPrice) > priceTol) continue;
        if (originalSize <= 0) continue;
        if (Math.abs(originalSize - req.size) > 0.05) continue;

        const statusResult = await this.getOrderStatus(orderId, req.tokenId);
        if (statusResult.kind !== "ok") continue;

        const { sizeMatched, status } = statusResult.status;
        const remaining = Math.max(
          0,
          Math.round((req.size - Math.min(sizeMatched, req.size)) * 100) / 100
        );
        logInfo("Recovered open order after submit failure", {
          orderId: orderId.slice(0, 12),
          token: req.tokenId.slice(0, 12),
          status,
        });
        return {
          preview: false,
          orderId,
          filledShares: Math.min(sizeMatched, req.size),
          filledUsd: Math.min(sizeMatched, req.size) * matchPrice,
          orderStatus: `${status} (recovered)`,
          pendingRemaining: remaining,
        };
      }
    } catch (e) {
      logError("Open order recovery failed", {
        token: req.tokenId.slice(0, 12),
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }

  private async resolveFill(
    orderId: string,
    req: PlaceOrderRequest,
    price: number,
    orderType: OrderType,
    immediate: { takingAmount?: string; makingAmount?: string; status?: string }
  ): Promise<{ shares: number; usd: number; status: string; remaining: number }> {
    if (orderType === OrderType.FAK || orderType === OrderType.FOK) {
      const fromResp = parseImmediateFill(immediate, req.side, price);
      if (fromResp.shares > 0) {
        return {
          ...fromResp,
          remaining: Math.max(0, Math.round((req.size - fromResp.shares) * 100) / 100),
        };
      }

      const polled = await this.pollOrderFill(orderId, req.size, price, 3000, req.tokenId);
      if (polled.shares > 0) return polled;

      return {
        shares: 0,
        usd: 0,
        status: immediate.status ?? "market order unfilled",
        remaining: 0,
      };
    }

    return this.pollOrderFill(
      orderId,
      req.size,
      price,
      this.global.execution.gtcFillTimeoutMs,
      req.tokenId
    );
  }

  private async pollOrderFill(
    orderId: string,
    requestedShares: number,
    price: number,
    timeoutMs: number,
    tokenId?: string
  ): Promise<{ shares: number; usd: number; status: string; remaining: number }> {
    if (timeoutMs <= 0) {
      return {
        shares: 0,
        usd: 0,
        status: "GTC submitted (fill polling disabled)",
        remaining: requestedShares,
      };
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const statusResult = await this.getOrderStatus(orderId, tokenId);
        if (statusResult.kind !== "ok") {
          await sleep(500);
          continue;
        }
        const { sizeMatched: matched, originalSize: original, status } = statusResult.status;

        if (matched > 0) {
          const shares = Math.min(matched, requestedShares);
          const remaining = Math.max(0, Math.round((requestedShares - shares) * 100) / 100);
          return {
            shares: Math.round(shares * 100) / 100,
            usd: Math.round(shares * price * 100) / 100,
            status: matched >= original * 0.99 ? status : `${status} (partial)`,
            remaining,
          };
        }

        if (isTerminalStatus(status)) {
          return { shares: 0, usd: 0, status, remaining: 0 };
        }
      } catch (e) {
        logError("Fill poll failed", {
          orderId: orderId.slice(0, 12),
          error: e instanceof Error ? e.message : String(e),
        });
      }

      await sleep(500);
    }

    try {
      const statusResult = await this.getOrderStatus(orderId, tokenId);
      if (statusResult.kind === "ok" && statusResult.status.sizeMatched > 0) {
        const shares = Math.min(statusResult.status.sizeMatched, requestedShares);
        logInfo("GTC partial fill after timeout", {
          orderId: orderId.slice(0, 12),
          matched: shares,
        });
        return {
          shares: Math.round(shares * 100) / 100,
          usd: Math.round(shares * price * 100) / 100,
          status: `${statusResult.status.status} (partial, timeout)`,
          remaining: Math.max(0, Math.round((requestedShares - shares) * 100) / 100),
        };
      }
    } catch {
      // ignore final poll failure
    }

    return {
      shares: 0,
      usd: 0,
      status: "GTC timeout — no fill",
      remaining: requestedShares,
    };
  }
}

function parseImmediateFill(
  resp: { takingAmount?: string; makingAmount?: string; status?: string },
  side: TradeSide,
  price: number
): { shares: number; usd: number; status: string } {
  const taking = parseFloat(resp.takingAmount ?? "0");
  const making = parseFloat(resp.makingAmount ?? "0");
  const status = resp.status ?? "matched";

  if (side === "BUY" && taking > 0) {
    return {
      shares: Math.round(taking * 100) / 100,
      usd: making > 0 ? Math.round(making * 100) / 100 : Math.round(taking * price * 100) / 100,
      status,
    };
  }
  if (side === "SELL" && making > 0) {
    return {
      shares: Math.round(making * 100) / 100,
      usd: taking > 0 ? Math.round(taking * 100) / 100 : Math.round(making * price * 100) / 100,
      status,
    };
  }

  return { shares: 0, usd: 0, status };
}

function isTerminalStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("cancel") || s.includes("reject") || s.includes("expired");
}

/** Errors that will not succeed on retry — safe to mark trade as seen. */
export function isDefiniteOrderRejection(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("balance") ||
    lower.includes("allowance") ||
    lower.includes("insufficient") ||
    lower.includes("invalid") ||
    lower.includes("reject") ||
    lower.includes("minimum") ||
    lower.includes("not enough") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("restricted in your region") ||
    lower.includes("geoblock") ||
    lower.includes("order signer address has to be the address of the api key")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
