import type { RuntimeConfig } from "../config/types.js";
import type { StateStore } from "../state/store.js";
import type { AuditAction } from "../state/store.js";
import type { AccountManager, AccountApiContext } from "../accounts/manager.js";
import { healthSnapshot, syncAggregateHealth } from "../notify/health.js";
import { z } from "zod";
import {
  buildRiskSnapshot,
  buildSettingsSnapshot,
  patchGlobalSettings,
  patchTelegramSettings,
  resetKillSwitch,
  setPreviewMode,
  stopCopyTrading,
  testProxyConnection,
} from "./settings.js";
import {
  leaderPatchSchema,
  leaderWriteSchema,
  leaderWriteToYaml,
  applyLeaderPatch,
  mergeLeaderWrite,
} from "../config/leader-schema.js";
import {
  documentLeaderToRecord,
  patchLeaderInAccount,
  readNormalizedConfigDocument,
  upsertLeaderInAccount,
  writeNormalizedConfigDocument,
} from "../config/write.js";
import { resolveUsernameToAddress } from "../leaders/resolve.js";
import { logInfo } from "../notify/logger.js";
import {
  fetchDiscoverLeaderboard,
  fetchTraderDetail,
  suggestLeaderId,
  type DiscoverTrader,
} from "./discover.js";
import { buildWalletProfile } from "./wallet.js";
import { createAccount, updateAccount } from "./accounts.js";
import { buildAccountPnlSnapshot, parsePnlRange } from "./pnl.js";
import { cancelPendingOrder } from "./orders.js";
import { deleteLeader, findLeaderIdForTrader } from "./leaders.js";

export interface ApiContext {
  manager: AccountManager;
  configPath: string;
  configFileKey: string;
  reloadConfig: () => Promise<void>;
}

/** @deprecated use AccountApiContext via manager.toApiContext */
export interface LegacyAccountContext {
  getConfig: () => RuntimeConfig;
  reloadConfig: () => Promise<void>;
  store: StateStore;
  configPath: string;
  configFileKey: string;
  dbPath: string;
  accountId: string;
}

function toLegacy(ctx: AccountApiContext, configFileKey: string): LegacyAccountContext {
  return {
    accountId: ctx.accountId,
    getConfig: ctx.getConfig,
    reloadConfig: ctx.reloadConfig,
    store: ctx.store,
    configPath: ctx.configPath,
    configFileKey,
    dbPath: ctx.dbPath,
  };
}

async function reloadConfigFromApi(
  ctx: ApiContext
): Promise<{ status: number; body: unknown }> {
  try {
    await ctx.reloadConfig();
    syncAggregateHealth(ctx.manager.list());
    return { status: 200, body: { ok: true } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 400, body: { error: msg } };
  }
}

function parseRoute(
  pathname: string,
  searchParams: URLSearchParams
): { accountId: string | null; subPath: string } {
  const accountMatch = pathname.match(/^\/api\/accounts\/([^/]+)(\/.*)?$/);
  if (accountMatch) {
    return {
      accountId: decodeURIComponent(accountMatch[1]!),
      subPath: accountMatch[2] || "/",
    };
  }
  const legacyId = searchParams.get("accountId");
  return { accountId: legacyId, subPath: pathname };
}

export async function handleApiRequest(
  ctx: ApiContext,
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body?: unknown
): Promise<{ status: number; body: unknown } | null> {
  if (pathname === "/api/accounts" && method === "GET") {
    return {
      status: 200,
      body: {
        accounts: ctx.manager.buildAccountsSummary(),
        defaultAccountId: ctx.manager.defaultAccountId,
      },
    };
  }

  if (pathname === "/api/accounts" && method === "POST") {
    return createAccount(ctx, body);
  }

  const accountRootMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountRootMatch && method === "PATCH") {
    return updateAccount(ctx, decodeURIComponent(accountRootMatch[1]!), body);
  }

  if (pathname === "/api/leaders/validate" && method === "GET") {
    return handleValidateLeader(searchParams);
  }

  if (pathname === "/api/discover/leaderboard" && method === "GET") {
    return handleDiscoverLeaderboard(ctx, searchParams);
  }

  if (pathname === "/api/discover/trader" && method === "GET") {
    return handleDiscoverTrader(ctx, searchParams);
  }

  if (pathname === "/api/config/reload" && method === "POST") {
    return reloadConfigFromApi(ctx);
  }

  if (pathname === "/api/settings/proxy/test" && method === "POST") {
    return testProxyConnection();
  }

  if (pathname === "/api/settings/telegram" && method === "PATCH") {
    return patchTelegramSettings(body);
  }

  const { accountId, subPath } = parseRoute(pathname, searchParams);
  let actx: AccountApiContext;
  try {
    actx = ctx.manager.toApiContext(accountId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 404, body: { error: msg } };
  }

  const legacy = toLegacy(actx, ctx.configFileKey);
  const path = subPath.startsWith("/api/") ? subPath : `/api${subPath === "/" ? "" : subPath}`;

  if (path === "/api/leaders" && method === "POST") {
    return handleCreateLeader(ctx, actx, body);
  }

  if (path === "/api/kill-switch/reset" && method === "POST") {
    return resetKillSwitch(legacy);
  }

  if (path === "/api/copy-trading/stop" && method === "POST") {
    return stopCopyTrading(ctx, actx);
  }

  if (path === "/api/settings/global" && method === "PATCH") {
    return patchGlobalSettings(ctx, actx, body);
  }

  if (path === "/api/mode/preview" && method === "POST") {
    return setPreviewMode(ctx, actx, true);
  }

  if (path === "/api/mode/live" && method === "POST") {
    return setPreviewMode(ctx, actx, false);
  }

  if (path === "/api/config/reload" && method === "POST") {
    return reloadConfigFromApi(ctx);
  }

  if (path === "/api/settings/proxy/test" && method === "POST") {
    return testProxyConnection();
  }

  const orderCancelMatch = path.match(/^\/api\/orders\/([^/]+)\/cancel$/);
  if (orderCancelMatch && method === "POST") {
    return cancelPendingOrder(actx, decodeURIComponent(orderCancelMatch[1]!));
  }

  const leaderMatch = path.match(/^\/api\/leaders\/([^/]+)$/);
  if (leaderMatch) {
    const leaderId = decodeURIComponent(leaderMatch[1]!);
    if (method === "GET") {
      return handleGetLeader(legacy, leaderId);
    }
    if (method === "PUT") {
      return handleUpdateLeader(ctx, actx, leaderId, body);
    }
    if (method === "PATCH") {
      return handlePatchLeader(ctx, actx, leaderId, body);
    }
    if (method === "DELETE") {
      return deleteLeader(ctx, actx, leaderId);
    }
  }

  if (method !== "GET") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  if (path === "/api/status") {
    return { status: healthSnapshot.killSwitchActive ? 503 : 200, body: buildStatus(ctx, actx) };
  }

  if (path === "/api/leaders") {
    return { status: 200, body: { leaders: buildLeaders(legacy), accountId: actx.accountId } };
  }

  if (path === "/api/positions") {
    return { status: 200, body: { positions: actx.store.listPositions(), accountId: actx.accountId } };
  }

  if (path === "/api/stats/daily") {
    const today = actx.store.getTodayStats();
    return {
      status: 200,
      body: {
        accountId: actx.accountId,
        today: today ?? {
          date: new Date().toISOString().slice(0, 10),
          volumeUsd: 0,
          realizedPnl: 0,
          copyCount: 0,
          killSwitch: actx.store.isKillSwitchActive() ? 1 : 0,
        },
        leaders: actx.store.listLeaderTodayStats(),
      },
    };
  }

  if (path === "/api/orders/pending") {
    return { status: 200, body: { orders: actx.store.listPendingOrders(), accountId: actx.accountId } };
  }

  if (path === "/api/audit") {
    const action = searchParams.get("action") as AuditAction | null;
    const leaderId = searchParams.get("leaderId") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const result = actx.store.listAuditLog({
      limit,
      offset,
      leaderId,
      action: action ?? undefined,
    });
    return { status: 200, body: { ...result, accountId: actx.accountId } };
  }

  if (path === "/api/stats/hourly") {
    const hours = parseInt(searchParams.get("hours") ?? "24", 10);
    return {
      status: 200,
      body: {
        accountId: actx.accountId,
        hours: Math.min(48, Math.max(1, hours)),
        buckets: actx.store.getHourlyAuditStats(hours),
      },
    };
  }

  if (path === "/api/auth/config") {
    const token = process.env.DASHBOARD_TOKEN?.trim();
    return {
      status: 200,
      body: {
        authRequired: Boolean(token && (process.env.DASHBOARD_ENABLED ?? "true") !== "false"),
        defaultAccountId: ctx.manager.defaultAccountId,
      },
    };
  }

  if (path === "/api/risk") {
    const rt = ctx.manager.require(actx.accountId);
    return {
      status: 200,
      body: {
        ...buildRiskSnapshot(legacy),
        walletDrifts: rt.health.walletDrifts,
        lastError: rt.health.lastError,
        accountId: actx.accountId,
      },
    };
  }

  if (path === "/api/settings") {
    try {
      return { status: 200, body: buildSettingsSnapshot(ctx, actx) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 500, body: { error: msg } };
    }
  }

  if (path === "/api/wallet") {
    return handleWalletProfile(legacy);
  }

  if (path === "/api/pnl") {
    return handleAccountPnl(legacy, searchParams);
  }

  return null;
}

async function handleAccountPnl(
  ctx: LegacyAccountContext,
  searchParams: URLSearchParams
): Promise<{ status: number; body: unknown }> {
  try {
    const config = ctx.getConfig();
    const today = ctx.store.getTodayStats();
    const range = parsePnlRange(searchParams.get("range"));
    const snapshot = await buildAccountPnlSnapshot({
      accountId: ctx.accountId,
      address: config.wallet.proxyAddress,
      range,
      engineTodayPnl: today?.realizedPnl ?? ctx.store.getDailyRealizedPnl(),
      previewMode: config.app.global.previewMode,
    });
    return { status: 200, body: snapshot };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 200, body: { error: msg } };
  }
}

async function handleWalletProfile(
  ctx: LegacyAccountContext
): Promise<{ status: number; body: unknown }> {
  try {
    const profile = await buildWalletProfile(ctx);
    return { status: 200, body: profile };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 200, body: { error: msg } };
  }
}

async function handleDiscoverTrader(
  ctx: ApiContext,
  searchParams: URLSearchParams
): Promise<{ status: number; body: unknown }> {
  const address = searchParams.get("address")?.trim();
  const accountId = ctx.manager.resolveAccountId(searchParams.get("accountId"));
  if (!address) {
    return { status: 400, body: { error: "address query param required" } };
  }
  try {
    const detail = await fetchTraderDetail(address);
    const actx = ctx.manager.toApiContext(accountId);
    const leaders = actx.getConfig().app.leaders;
    const userName = detail.profile?.userName ?? detail.rankStats?.userName;
    const followingLeaderId = findLeaderIdForTrader(leaders, address, userName);
    return {
      status: 200,
      body: {
        ...detail,
        suggestedId: suggestLeaderId(userName, detail.address),
        following: Boolean(followingLeaderId),
        followingLeaderId,
        accountId,
        polymarketUrl: userName
          ? `https://polymarket.com/@${encodeURIComponent(userName.replace(/^@/, ""))}`
          : `https://polymarket.com/profile/${detail.address}`,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 200,
      body: { error: msg, hint: "无法拉取 Trader 详情，请检查网络或 HTTPS_PROXY" },
    };
  }
}

async function handleDiscoverLeaderboard(
  ctx: ApiContext,
  searchParams: URLSearchParams
): Promise<{ status: number; body: unknown }> {
  try {
    const limit = parseInt(searchParams.get("limit") ?? "25", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const accountId = ctx.manager.resolveAccountId(searchParams.get("accountId"));
    const actx = ctx.manager.toApiContext(accountId);
    const { traders, cached } = await fetchDiscoverLeaderboard({
      category: searchParams.get("category") ?? "OVERALL",
      timePeriod: searchParams.get("timePeriod") ?? "MONTH",
      orderBy: searchParams.get("orderBy") ?? "PNL",
      limit,
      offset,
    });

    const leaders = actx.getConfig().app.leaders;

    const enriched = traders.map((t) => {
      const followingLeaderId = findLeaderIdForTrader(leaders, t.proxyWallet, t.userName);
      return {
      ...t,
      suggestedId: suggestLeaderId(t.userName, t.proxyWallet),
      following: Boolean(followingLeaderId),
      followingLeaderId,
      polymarketUrl: t.userName
        ? `https://polymarket.com/@${encodeURIComponent(t.userName.replace(/^@/, ""))}`
        : `https://polymarket.com/profile/${t.proxyWallet}`,
    };
    });

    return {
      status: 200,
      body: {
        traders: enriched,
        cached,
        accountId,
        filters: {
          category: searchParams.get("category") ?? "OVERALL",
          timePeriod: searchParams.get("timePeriod") ?? "MONTH",
          orderBy: searchParams.get("orderBy") ?? "PNL",
        },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 200,
      body: {
        traders: [] as DiscoverTrader[],
        error: msg,
        hint: "无法连接 Polymarket Data API。请在「设置 → 网络」配置代理，或在 .env 设置 HTTPS_PROXY。",
      },
    };
  }
}

async function handleValidateLeader(
  searchParams: URLSearchParams
): Promise<{ status: number; body: unknown }> {
  const address = searchParams.get("address")?.trim();
  const username = searchParams.get("username")?.replace(/^@/, "").trim();

  if (address) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return { status: 400, body: { valid: false, error: "Invalid address format" } };
    }
    const result = await validateLeaderAddress(address);
    return {
      status: 200,
      body: { mode: "address", address, ...result },
    };
  }

  if (username) {
    try {
      const resolved = await resolveUsernameToAddress(username);
      const result = await validateLeaderAddress(resolved);
      return {
        status: 200,
        body: { mode: "username", username, resolvedAddress: resolved, ...result },
      };
    } catch (e) {
      return {
        status: 200,
        body: {
          mode: "username",
          username,
          valid: false,
          trades: 0,
          error: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  return { status: 400, body: { error: "Provide address or username query param" } };
}

async function handleCreateLeader(
  ctx: ApiContext,
  actx: AccountApiContext,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  try {
    const input = leaderWriteSchema.parse(body);
    const normalized = readNormalizedConfigDocument(ctx.configPath);
    const account = normalized.accounts.find((a) => a.id === actx.accountId);
    if (account?.leaders.some((l) => l.id === input.id)) {
      return { status: 409, body: { error: `Leader id already exists: ${input.id}` } };
    }
    const row = leaderWriteToYaml(input);
    const next = upsertLeaderInAccount(normalized, actx.accountId, row);
    writeNormalizedConfigDocument(ctx.configPath, next);
    await ctx.reloadConfig();
    syncAggregateHealth(ctx.manager.list());
    logInfo("Leader created via dashboard", { accountId: actx.accountId, id: input.id });
    const legacy = toLegacy(ctx.manager.toApiContext(actx.accountId), ctx.configFileKey);
    return { status: 201, body: { ok: true, leader: buildLeaderDto(legacy, input.id) } };
  } catch (e) {
    return formatWriteError(e);
  }
}

async function handleUpdateLeader(
  ctx: ApiContext,
  actx: AccountApiContext,
  leaderId: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  try {
    const input = leaderWriteSchema.parse({ ...(body as object), id: leaderId });
    const normalized = readNormalizedConfigDocument(ctx.configPath);
    const account = normalized.accounts.find((a) => a.id === actx.accountId);
    const existing = account?.leaders.find((l) => l.id === leaderId);
    if (!existing) {
      return { status: 404, body: { error: `Leader not found: ${leaderId}` } };
    }
    const row = leaderWriteToYaml(input);
    const merged = mergeLeaderWrite(documentLeaderToRecord(existing), row);
    const next = upsertLeaderInAccount(normalized, actx.accountId, merged, leaderId);
    writeNormalizedConfigDocument(ctx.configPath, next);
    await ctx.reloadConfig();
    syncAggregateHealth(ctx.manager.list());
    logInfo("Leader updated via dashboard", { accountId: actx.accountId, id: leaderId });
    const legacy = toLegacy(ctx.manager.toApiContext(actx.accountId), ctx.configFileKey);
    return { status: 200, body: { ok: true, leader: buildLeaderDto(legacy, leaderId) } };
  } catch (e) {
    return formatWriteError(e);
  }
}

async function handlePatchLeader(
  ctx: ApiContext,
  actx: AccountApiContext,
  leaderId: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  try {
    const patch = leaderPatchSchema.parse(body);
    const normalized = readNormalizedConfigDocument(ctx.configPath);
    const account = normalized.accounts.find((a) => a.id === actx.accountId);
    const existing = account?.leaders.find((l) => l.id === leaderId);
    if (!existing) {
      return { status: 404, body: { error: `Leader not found: ${leaderId}` } };
    }
    const merged = applyLeaderPatch(documentLeaderToRecord(existing), patch);
    const next = patchLeaderInAccount(normalized, actx.accountId, leaderId, merged);
    writeNormalizedConfigDocument(ctx.configPath, next);
    await ctx.reloadConfig();
    syncAggregateHealth(ctx.manager.list());
    const legacy = toLegacy(ctx.manager.toApiContext(actx.accountId), ctx.configFileKey);
    return { status: 200, body: { ok: true, leader: buildLeaderDto(legacy, leaderId) } };
  } catch (e) {
    return formatWriteError(e);
  }
}

function handleGetLeader(
  ctx: LegacyAccountContext,
  leaderId: string
): { status: number; body: unknown } {
  const leader = buildLeaders(ctx).find((l) => l.id === leaderId);
  if (!leader) {
    return { status: 404, body: { error: `Leader not found: ${leaderId}` } };
  }
  return { status: 200, body: { leader, accountId: ctx.accountId } };
}

function buildLeaderDto(ctx: LegacyAccountContext, leaderId: string) {
  return buildLeaders(ctx).find((l) => l.id === leaderId);
}

function formatWriteError(e: unknown): { status: number; body: unknown } {
  if (e instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: "Validation failed",
        details: e.errors.map((x) => ({ path: x.path.join("."), message: x.message })),
      },
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 400, body: { error: msg } };
}

function buildStatus(ctx: ApiContext, actx: AccountApiContext) {
  const rt = ctx.manager.require(actx.accountId);
  return {
    version: "1.0.0",
    accountId: actx.accountId,
    accountLabel: actx.label,
    status: rt.health.killSwitchActive ? "degraded" : "ok",
    uptimeSec: Math.floor((Date.now() - healthSnapshot.startedAt) / 1000),
    previewMode: rt.config.app.global.previewMode,
    copyTradingEnabled: rt.config.app.global.risk.enableCopyTrading,
    killSwitchActive: rt.store.isKillSwitchActive(),
    lastPollAt: rt.health.lastPollAt,
    lastPoll: rt.health.lastPollResult,
    enabledLeaders: rt.health.enabledLeaders,
    lastError: rt.health.lastError,
    pendingOrders: rt.health.pendingOrders,
    walletDrifts: rt.health.walletDrifts,
    dbPath: actx.dbPath,
    configPath: ctx.configPath,
    accounts: ctx.manager.buildAccountsSummary(),
  };
}

function buildLeaders(ctx: LegacyAccountContext) {
  const config = ctx.getConfig();
  const leaderStats = new Map(
    ctx.store.listLeaderTodayStats().map((s) => [s.leaderId, s.volumeUsd])
  );

  return config.app.leaders.map((l) => ({
    id: l.id,
    address: l.address,
    username: l.username,
    enabled: l.enabled,
    weight: l.weight,
    strategy: l.strategy,
    limits: l.limits,
    filters: l.filters,
    todayVolumeUsd: leaderStats.get(l.id) ?? 0,
  }));
}

import { ActivityType } from "@polymarket/bindings/data";

export async function validateLeaderAddress(
  address: string
): Promise<{ valid: boolean; trades: number }> {
  try {
    const { getPublicClient } = await import("../sdk/public-client.js");
    const client = await getPublicClient();
    const paginator = client.listActivity({
      user: address,
      pageSize: 5,
      type: [ActivityType.TRADE],
    });
    const page = await paginator.firstPage();
    const trades = page.items.filter((a) => a.type === "TRADE").length;
    return { valid: trades > 0, trades };
  } catch {
    return { valid: false, trades: 0 };
  }
}
