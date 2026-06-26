import { z } from "zod";
import {
  accountMergedGlobal,
  findAccountYaml,
  globalYamlSchema,
  normalizeConfigDocument,
  type NormalizedConfigDocument,
} from "./document.js";
import { isValidProxyUrl, maskProxyUrl } from "../util/proxy.js";

const orderType = z.enum(["GTC", "FAK", "FOK"]);
const conflictMode = z.enum(["skip_both", "net", "priority_leader"]);
const proxyModeDto = z.enum(["none", "static", "dynamic"]);

export const proxySettingsPatchSchema = z.object({
  mode: proxyModeDto,
  staticUrl: z.string().optional(),
  dynamicUrl: z.string().optional(),
  dynamicRotateSession: z.boolean().optional(),
});

export const globalSettingsPatchSchema = z.object({
  pollIntervalMs: z.number().int().min(1000).optional(),
  activityLimit: z.number().int().min(10).max(500).optional(),
  previewMode: z.boolean().optional(),
  copyTradesOnly: z.boolean().optional(),
  maxTradeAgeHours: z.number().positive().optional(),
  buyDedupWindowMs: z.number().int().nonnegative().optional(),
  tradeAggregationWindowMs: z.number().int().nonnegative().optional(),
  healthPort: z.number().int().min(0).max(65535).optional(),
  risk: z
    .object({
      enableCopyTrading: z.boolean().optional(),
      dailyLossCapPct: z.number().positive().optional(),
      startingCapitalUsd: z.number().positive().optional(),
      maxDailyVolumeUsd: z.number().nonnegative().optional(),
      maxOpenMarkets: z.number().int().positive().optional(),
      maxOrderUsd: z.number().positive().optional(),
      minOrderUsd: z.number().positive().optional(),
      slippageTolerance: z.number().nonnegative().optional(),
      maxPositionPerTokenUsd: z.number().nonnegative().optional(),
      positionCapBasis: z.enum(["market", "cost"]).optional(),
      syncWalletBalance: z.boolean().optional(),
    })
    .optional(),
  execution: z
    .object({
      orderType: orderType.optional(),
      retryLimit: z.number().int().nonnegative().optional(),
      networkRetryLimit: z.number().int().nonnegative().optional(),
      gtcFillTimeoutMs: z.number().int().nonnegative().optional(),
      pendingOrderMaxAgeHours: z.number().positive().optional(),
    })
    .optional(),
  conflict: z
    .object({
      mode: conflictMode.optional(),
      priority: z.array(z.string()).optional(),
    })
    .optional(),
  notify: z
    .object({
      telegramOnCopy: z.boolean().optional(),
      telegramOnError: z.boolean().optional(),
      telegramOnKillSwitch: z.boolean().optional(),
    })
    .optional(),
  proxy: proxySettingsPatchSchema.optional(),
});

export type GlobalSettingsPatch = z.infer<typeof globalSettingsPatchSchema>;

export function proxyConfigToDto(global: Record<string, unknown>) {
  const p = (global.proxy as Record<string, unknown> | undefined) ?? {};
  const modeRaw = String(p.mode ?? "none");
  const mode =
    modeRaw === "fixed" || modeRaw === "static"
      ? "static"
      : modeRaw === "dynamic"
        ? "dynamic"
        : "none";
  const staticUrl = String(p.static_url ?? "");
  const dynamicUrl = String(p.dynamic_url ?? "");
  return {
    mode: mode as "none" | "static" | "dynamic",
    staticUrl,
    dynamicUrl,
    dynamicRotateSession: p.dynamic_rotate_session !== false,
  };
}

/** API / dashboard DTO — credentials in proxy URLs are masked. */
export function proxyConfigToPublicDto(global: Record<string, unknown>) {
  const raw = proxyConfigToDto(global);
  return {
    mode: raw.mode,
    staticUrl: raw.staticUrl ? maskProxyUrl(raw.staticUrl) : "",
    dynamicUrl: raw.dynamicUrl ? maskProxyUrl(raw.dynamicUrl) : "",
    staticUrlConfigured: Boolean(raw.staticUrl.trim()),
    dynamicUrlConfigured: Boolean(raw.dynamicUrl.trim()),
    dynamicRotateSession: raw.dynamicRotateSession,
  };
}

export function validateProxyPatch(
  patch: z.infer<typeof proxySettingsPatchSchema>,
  defaultsGlobal: Record<string, unknown>
): void {
  const current = proxyConfigToDto(defaultsGlobal);
  if (patch.mode === "static") {
    const url = (patch.staticUrl?.trim() || current.staticUrl.trim());
    if (!url) {
      throw new Error("固定 IP 模式需要填写代理地址");
    }
    if (!isValidProxyUrl(url)) {
      throw new Error("无效的固定代理 URL（需 http:// 或 https:// 开头）");
    }
  }
  if (patch.mode === "dynamic") {
    const url = (patch.dynamicUrl?.trim() || current.dynamicUrl.trim());
    if (!url) {
      throw new Error("动态 IP 模式需要填写代理地址");
    }
    if (!isValidProxyUrl(url)) {
      throw new Error("无效的动态代理 URL（需 http:// 或 https:// 开头）");
    }
  }
  if (patch.staticUrl?.trim() && !isValidProxyUrl(patch.staticUrl.trim())) {
    throw new Error("无效的固定代理 URL");
  }
  if (patch.dynamicUrl?.trim() && !isValidProxyUrl(patch.dynamicUrl.trim())) {
    throw new Error("无效的动态代理 URL");
  }
}

export function globalConfigToDto(global: Record<string, unknown>) {
  const g = global as {
    poll_interval_ms?: number;
    activity_limit?: number;
    preview_mode?: boolean;
    copy_trades_only?: boolean;
    max_trade_age_hours?: number;
    buy_dedup_window_ms?: number;
    trade_aggregation_window_ms?: number;
    health_port?: number;
    risk?: Record<string, unknown>;
    execution?: Record<string, unknown>;
    conflict?: Record<string, unknown>;
    notify?: Record<string, unknown>;
  };
  const r = g.risk ?? {};
  const e = g.execution ?? {};
  const c = g.conflict ?? {};
  const n = g.notify ?? {};
  return {
    pollIntervalMs: g.poll_interval_ms ?? 5000,
    activityLimit: g.activity_limit ?? 100,
    previewMode: g.preview_mode ?? true,
    copyTradesOnly: g.copy_trades_only ?? true,
    maxTradeAgeHours: g.max_trade_age_hours ?? 1,
    buyDedupWindowMs: g.buy_dedup_window_ms ?? 60000,
    tradeAggregationWindowMs: g.trade_aggregation_window_ms ?? 0,
    healthPort: g.health_port ?? 8080,
    risk: {
      enableCopyTrading: r.enable_copy_trading ?? true,
      dailyLossCapPct: r.daily_loss_cap_pct ?? 20,
      startingCapitalUsd: r.starting_capital_usd ?? 1000,
      maxDailyVolumeUsd: r.max_daily_volume_usd ?? 2000,
      maxOpenMarkets: r.max_open_markets ?? 30,
      maxOrderUsd: r.max_order_usd ?? 50,
      minOrderUsd: r.min_order_usd ?? 1,
      slippageTolerance: r.slippage_tolerance ?? 0.03,
      maxPositionPerTokenUsd: r.max_position_per_token_usd ?? 0,
      positionCapBasis: ((r.position_cap_basis as "market" | "cost" | undefined) ?? "market"),
      syncWalletBalance: r.sync_wallet_balance ?? true,
    },
    execution: {
      orderType: e.order_type ?? "GTC",
      retryLimit: e.retry_limit ?? 3,
      networkRetryLimit: e.network_retry_limit ?? 3,
      gtcFillTimeoutMs: e.gtc_fill_timeout_ms ?? 10000,
      pendingOrderMaxAgeHours: e.pending_order_max_age_hours ?? 48,
    },
    conflict: {
      mode: c.mode ?? "priority_leader",
      priority: (c.priority as string[] | undefined) ?? [],
    },
    notify: {
      telegramOnCopy: n.telegram_on_copy ?? true,
      telegramOnError: n.telegram_on_error ?? true,
      telegramOnKillSwitch: n.telegram_on_kill_switch ?? true,
    },
    proxy: proxyConfigToDto(global),
  };
}

function applyProxyPatchToRecord(g: Record<string, unknown>, patch: z.infer<typeof proxySettingsPatchSchema>): void {
  const proxy = { ...((g.proxy as Record<string, unknown>) ?? {}) };
  proxy.mode = patch.mode;
  if (patch.staticUrl !== undefined) {
    const trimmed = patch.staticUrl.trim();
    if (trimmed) proxy.static_url = trimmed;
  }
  if (patch.dynamicUrl !== undefined) {
    const trimmed = patch.dynamicUrl.trim();
    if (trimmed) proxy.dynamic_url = trimmed;
  }
  if (patch.dynamicRotateSession !== undefined) {
    proxy.dynamic_rotate_session = patch.dynamicRotateSession;
  }
  g.proxy = proxy;
}

function applyGlobalPatchToRecord(g: Record<string, unknown>, patch: GlobalSettingsPatch): void {
  if (patch.pollIntervalMs !== undefined) g.poll_interval_ms = patch.pollIntervalMs;
  if (patch.activityLimit !== undefined) g.activity_limit = patch.activityLimit;
  if (patch.previewMode !== undefined) g.preview_mode = patch.previewMode;
  if (patch.copyTradesOnly !== undefined) g.copy_trades_only = patch.copyTradesOnly;
  if (patch.maxTradeAgeHours !== undefined) g.max_trade_age_hours = patch.maxTradeAgeHours;
  if (patch.buyDedupWindowMs !== undefined) g.buy_dedup_window_ms = patch.buyDedupWindowMs;
  if (patch.tradeAggregationWindowMs !== undefined) {
    g.trade_aggregation_window_ms = patch.tradeAggregationWindowMs;
  }
  if (patch.healthPort !== undefined) g.health_port = patch.healthPort;

  if (patch.risk) {
    const risk = { ...((g.risk as Record<string, unknown>) ?? {}) };
    const r = patch.risk;
    if (r.enableCopyTrading !== undefined) risk.enable_copy_trading = r.enableCopyTrading;
    if (r.dailyLossCapPct !== undefined) risk.daily_loss_cap_pct = r.dailyLossCapPct;
    if (r.startingCapitalUsd !== undefined) risk.starting_capital_usd = r.startingCapitalUsd;
    if (r.maxDailyVolumeUsd !== undefined) risk.max_daily_volume_usd = r.maxDailyVolumeUsd;
    if (r.maxOpenMarkets !== undefined) risk.max_open_markets = r.maxOpenMarkets;
    if (r.maxOrderUsd !== undefined) risk.max_order_usd = r.maxOrderUsd;
    if (r.minOrderUsd !== undefined) risk.min_order_usd = r.minOrderUsd;
    if (r.slippageTolerance !== undefined) risk.slippage_tolerance = r.slippageTolerance;
    if (r.maxPositionPerTokenUsd !== undefined) {
      risk.max_position_per_token_usd = r.maxPositionPerTokenUsd;
    }
    if (r.positionCapBasis !== undefined) risk.position_cap_basis = r.positionCapBasis;
    if (r.syncWalletBalance !== undefined) risk.sync_wallet_balance = r.syncWalletBalance;
    g.risk = risk;
  }

  if (patch.execution) {
    const execution = { ...((g.execution as Record<string, unknown>) ?? {}) };
    const e = patch.execution;
    if (e.orderType !== undefined) execution.order_type = e.orderType;
    if (e.retryLimit !== undefined) execution.retry_limit = e.retryLimit;
    if (e.networkRetryLimit !== undefined) execution.network_retry_limit = e.networkRetryLimit;
    if (e.gtcFillTimeoutMs !== undefined) execution.gtc_fill_timeout_ms = e.gtcFillTimeoutMs;
    if (e.pendingOrderMaxAgeHours !== undefined) {
      execution.pending_order_max_age_hours = e.pendingOrderMaxAgeHours;
    }
    g.execution = execution;
  }

  if (patch.conflict) {
    const conflict = { ...((g.conflict as Record<string, unknown>) ?? {}) };
    if (patch.conflict.mode !== undefined) conflict.mode = patch.conflict.mode;
    if (patch.conflict.priority !== undefined) conflict.priority = patch.conflict.priority;
    g.conflict = conflict;
  }

  if (patch.notify) {
    const notify = { ...((g.notify as Record<string, unknown>) ?? {}) };
    const n = patch.notify;
    if (n.telegramOnCopy !== undefined) notify.telegram_on_copy = n.telegramOnCopy;
    if (n.telegramOnError !== undefined) notify.telegram_on_error = n.telegramOnError;
    if (n.telegramOnKillSwitch !== undefined) notify.telegram_on_kill_switch = n.telegramOnKillSwitch;
    g.notify = notify;
  }

  if (patch.proxy) {
    applyProxyPatchToRecord(g, patch.proxy);
  }
}

export function applyGlobalSettingsPatch(
  doc: { global: Record<string, unknown> },
  patch: GlobalSettingsPatch
): void {
  applyGlobalPatchToRecord(doc.global, patch);
}

export function applyAccountGlobalSettingsPatch(
  normalized: NormalizedConfigDocument,
  accountId: string,
  patch: GlobalSettingsPatch
): NormalizedConfigDocument {
  const account = findAccountYaml(normalized, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  if (patch.proxy) {
    const defaultsGlobal = { ...normalized.defaultsGlobal } as Record<string, unknown>;
    applyProxyPatchToRecord(defaultsGlobal, patch.proxy);
    normalized.defaultsGlobal = globalYamlSchema.parse(defaultsGlobal);
  }

  const { proxy: _proxy, ...accountPatch } = patch;

  if (normalized.format === "legacy") {
    const global = { ...normalized.defaultsGlobal } as Record<string, unknown>;
    applyGlobalPatchToRecord(global, accountPatch);
    normalized.defaultsGlobal = globalYamlSchema.parse(global);
    return normalized;
  }

  const currentMerged = accountMergedGlobal(normalized, account);
  const global = { ...currentMerged } as Record<string, unknown>;
  applyGlobalPatchToRecord(global, accountPatch);

  const merged = globalYamlSchema.parse(global);
  const defaults = normalized.defaultsGlobal;
  const overrides: Partial<typeof defaults> = {};

  for (const key of Object.keys(merged) as (keyof typeof defaults)[]) {
    const mergedVal = merged[key];
    const defaultVal = defaults[key];
    if (JSON.stringify(mergedVal) !== JSON.stringify(defaultVal)) {
      (overrides as Record<string, unknown>)[key] = mergedVal;
    }
  }

  const accounts = normalized.accounts.map((a) =>
    a.id === accountId ? { ...a, global: overrides } : a
  );

  return normalizeConfigDocument({
    defaults: { global: defaults },
    accounts,
  });
}
