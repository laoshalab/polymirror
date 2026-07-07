import { fetchWalletCollateral, type CollateralSource } from "../executor/balance.js";
import { getPublicClient } from "../sdk/public-client.js";

export interface PolymarketPosition {
  conditionId?: string;
  title?: string;
  outcome?: string;
  size: number;
  avgPrice: number;
  curPrice?: number;
  currentValue: number;
  cashPnl?: number;
  percentPnl?: number;
  redeemable?: boolean;
  asset?: string;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapSdkPosition(p: {
  conditionId?: unknown;
  title?: string | null;
  outcome?: string | null;
  size?: unknown;
  avgPrice?: unknown;
  curPrice?: unknown;
  currentValue?: unknown;
  cashPnl?: unknown;
  percentPnl?: number | null;
  redeemable?: boolean | null;
  tokenId?: unknown;
  asset?: unknown;
}): PolymarketPosition {
  return {
    conditionId: p.conditionId ? String(p.conditionId) : undefined,
    title: p.title ?? undefined,
    outcome: p.outcome ?? undefined,
    size: num(p.size),
    avgPrice: num(p.avgPrice),
    curPrice: p.curPrice !== undefined && p.curPrice !== null ? num(p.curPrice) : undefined,
    currentValue: num(p.currentValue),
    cashPnl: p.cashPnl !== undefined && p.cashPnl !== null ? num(p.cashPnl) : undefined,
    percentPnl: p.percentPnl ?? undefined,
    redeemable: p.redeemable ?? undefined,
    asset: p.tokenId ? String(p.tokenId) : p.asset ? String(p.asset) : undefined,
  };
}

async function fetchPortfolioValue(address: string): Promise<number> {
  const client = await getPublicClient();
  const rows = await client.fetchPortfolioValue({ user: address });
  const row = rows[0];
  return row?.value !== undefined && row.value !== null ? num(row.value) : 0;
}

async function fetchPolymarketPositions(address: string): Promise<PolymarketPosition[]> {
  const client = await getPublicClient();
  const paginator = client.listPositions({
    user: address,
    pageSize: 100,
    sortBy: "CURRENT",
    sortDirection: "DESC",
  });
  const page = await paginator.firstPage();
  return page.items.map((p) => mapSdkPosition(p));
}

import type { TraderDetail } from "./discover.js";

export async function buildWalletProfile(ctx: import("./routes.js").LegacyAccountContext) {
  const config = ctx.getConfig();
  const address = config.wallet.proxyAddress;
  const store = ctx.store;
  const today = store.getTodayStats();
  const localPositions = store.listPositions();

  let portfolioValue = 0;
  let polymarketPositions: PolymarketPosition[] = [];
  let profile: TraderDetail["profile"];
  let recentTrades: TraderDetail["recentTrades"] = [];
  let rankStats: TraderDetail["rankStats"];
  let apiError: string | undefined;
  let cashUsd: number | null = null;
  let clobCashUsd: number | null = null;
  let chainCashUsd: number | null = null;
  let pusdAllowancesReady: boolean | null = null;
  let collateralSource: CollateralSource = "none";
  let collateralError: string | undefined;
  let geoblock: import("../executor/geoblock.js").GeoblockStatus | null = null;
  let geoblockHint: string | undefined;

  try {
    const geoblockMod = await import("../executor/geoblock.js");
    geoblock = await geoblockMod.fetchGeoblockStatus();
    if (geoblock?.blocked) {
      geoblockHint = geoblockMod.formatGeoblockMessage(geoblock);
    }
  } catch {
    /* geoblock check is best-effort for dashboard */
  }

  try {
    const { fetchTraderDetail } = await import("./discover.js");
    const [value, positions, detail, collateral] = await Promise.all([
      fetchPortfolioValue(address),
      fetchPolymarketPositions(address),
      fetchTraderDetail(address).then((r) => r.detail).catch(() => null),
      fetchWalletCollateral(config.wallet).catch((e) => {
        collateralError = e instanceof Error ? e.message : String(e);
        return null;
      }),
    ]);
    portfolioValue = value;
    polymarketPositions = positions;
    if (collateral) {
      cashUsd = collateral.cashUsd;
      clobCashUsd = collateral.clobUsd;
      chainCashUsd = collateral.chainUsd;
      pusdAllowancesReady = collateral.pusdAllowancesReady;
      collateralSource = collateral.source;
    }
    if (detail) {
      profile = detail.profile;
      recentTrades = detail.recentTrades.slice(0, 20);
      rankStats = detail.rankStats;
    }
  } catch (e) {
    apiError = e instanceof Error ? e.message : String(e);
  }

  const positionsValueUsd =
    portfolioValue > 0 ? portfolioValue : polymarketPositions.reduce((s, p) => s + p.currentValue, 0);
  const totalValueUsd = (cashUsd ?? 0) + positionsValueUsd;

  const unrealizedPnl = polymarketPositions.reduce((s, p) => s + (p.cashPnl ?? 0), 0);
  const localExposure = localPositions.reduce((s, p) => s + p.shares * p.avgEntryPrice, 0);
  let previewCashUsd: number | undefined;
  if (config.app.global.previewMode) {
    store.ensurePreviewCash(config.app.global.risk.startingCapitalUsd);
    previewCashUsd = store.getPreviewCashUsd();
  }

  return {
    accountId: ctx.accountId,
    address,
    polymarketUrl: `https://polymarket.com/profile/${address}`,
    previewMode: config.app.global.previewMode,
    profile: profile ?? undefined,
    rankStats,
    portfolio: {
      cashUsd,
      positionsValueUsd,
      totalValueUsd,
      valueUsd: totalValueUsd,
      unrealizedPnl,
      positionCount: polymarketPositions.length,
    },
    engine: {
      dbPath: ctx.dbPath,
      todayVolumeUsd: today?.volumeUsd ?? store.getDailyVolumeUsd(),
      todayRealizedPnl: today?.realizedPnl ?? store.getDailyRealizedPnl(),
      todayCopyCount: today?.copyCount ?? 0,
      localPositionCount: localPositions.length,
      localExposureUsd: localExposure,
      previewCashUsd,
      killSwitchActive: store.isKillSwitchActive(),
    },
    polymarketPositions,
    localPositions,
    recentTrades: recentTrades.map((t) => ({
      timestamp: t.timestamp,
      side: t.side,
      size: t.size,
      price: t.price,
      usdcSize: t.usdcSize,
      title: t.title,
      outcome: t.outcome,
    })),
    error: apiError,
    collateralError,
    collateralSource,
    clobCashUsd,
    chainCashUsd,
    pusdAllowancesReady,
    geoblock: geoblock ?? undefined,
    geoblockHint,
    hint: geoblockHint
      ? geoblockHint
      : apiError
        ? "无法连接 Polymarket API。请在「设置 → 网络」配置代理，或在 .env 设置 HTTPS_PROXY。"
        : collateralError
          ? "链上 USDC 余额需通过 SecureClient 查询；请确认 .env 私钥与 Proxy 地址正确。"
          : undefined,
  };
}
