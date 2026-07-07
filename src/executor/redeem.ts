import type { WalletConfig } from "../config/types.js";
import { getPublicClient } from "../sdk/public-client.js";
import { getSecureClient } from "./secure-client.js";
import { logInfo, logError } from "../notify/logger.js";

export interface RedeemablePositionRow {
  conditionId: string;
  tokenId: string;
  size: number;
  payoutPerShare: number;
}

export interface RedeemConditionResult {
  ok: boolean;
  conditionId: string;
  txHash?: string;
  error?: string;
  benignFailure?: boolean;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function isBenignRedeemError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already redeemed") ||
    m.includes("already been redeemed") ||
    m.includes("nothing to redeem") ||
    m.includes("no positions to redeem") ||
    m.includes("no positions")
  );
}

/** Polymarket Data API positions flagged redeemable after market resolution. */
export async function listRedeemablePositions(
  userAddress: string
): Promise<RedeemablePositionRow[]> {
  const client = await getPublicClient();
  const paginator = client.listPositions({
    user: userAddress,
    redeemable: true,
    pageSize: 100,
    sortBy: "CURRENT",
    sortDirection: "DESC",
  });

  const rows: RedeemablePositionRow[] = [];
  for await (const page of paginator) {
    for (const p of page.items) {
      const conditionId = p.conditionId != null ? String(p.conditionId) : "";
      const tokenId =
        p.tokenId != null ? String(p.tokenId) : p.asset != null ? String(p.asset) : "";
      if (!conditionId || !tokenId) continue;
      const size = num(p.size);
      if (size < 0.01) continue;
      const curPrice = p.curPrice != null ? num(p.curPrice) : 0;
      const currentValue = num(p.currentValue);
      const payoutPerShare =
        curPrice > 0 ? curPrice : size > 0 ? currentValue / size : 0;
      rows.push({
        conditionId,
        tokenId,
        size,
        payoutPerShare: Math.round(payoutPerShare * 10000) / 10000,
      });
    }
  }
  return rows;
}

/** Submit CTF redeem via SecureClient (relayer gasless when configured). */
export async function redeemConditionOnChain(
  wallet: WalletConfig,
  conditionId: string
): Promise<RedeemConditionResult> {
  try {
    const client = await getSecureClient(wallet);
    const handle = await client.redeemPositions({ conditionId });
    const outcome = await handle.wait();
    const txHash =
      outcome && typeof outcome === "object" && "transactionHash" in outcome
        ? String((outcome as { transactionHash?: string }).transactionHash ?? "")
        : undefined;
    logInfo("On-chain redeem succeeded", {
      conditionId: conditionId.slice(0, 12),
      txHash: txHash?.slice(0, 14),
    });
    return { ok: true, conditionId, txHash: txHash || undefined };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const benignFailure = isBenignRedeemError(error);
    if (benignFailure) {
      logInfo("On-chain redeem skipped (benign)", {
        conditionId: conditionId.slice(0, 12),
        error: error.slice(0, 120),
      });
    } else {
      logError("On-chain redeem failed", {
        conditionId: conditionId.slice(0, 12),
        error: error.slice(0, 200),
      });
    }
    return { ok: false, conditionId, error, benignFailure };
  }
}
