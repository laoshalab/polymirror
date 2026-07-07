import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { Wallet } from "@ethersproject/wallet";
import type {
  AppConfig,
  AccountDefinition,
  MultiAccountConfig,
  RuntimeConfig,
  WalletConfig,
  LeaderConfig,
  ProxyMode,
  TradingBackendKind,
} from "./types.js";
import {
  accountMergedGlobal,
  globalYamlSchema,
  leaderYamlSchema,
  normalizeConfigDocument,
  type GlobalYaml,
  type LeaderYaml,
  type NormalizedConfigDocument,
} from "./document.js";
import { resolveAccountDbPath } from "../state/db-path.js";
import { applyProxyFromYaml } from "../util/proxy.js";

export {
  appConfigSchema,
  legacyAppConfigSchema,
  type AppConfigDocument,
  type LegacyAppConfigDocument,
  leaderYamlSchema,
} from "./document.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isTemplatePlaceholder(value: string): boolean {
  return /REPLACE/i.test(value) || /_{3,}/.test(value);
}

function envVarName(base: string, walletEnv: string): string {
  const suffix = walletEnv.trim().toUpperCase();
  if (!suffix) return base;
  return `${base}_${suffix}`;
}

function formatConfigValidationError(e: z.ZodError, configPath: string): string {
  const lines = e.errors.map((err) => {
    const path = err.path.join(".") || "(root)";
    if (err.path.includes("address")) {
      return [
        `  • ${path}`,
        `    需要 Polymarket proxy 地址：0x 开头 + 40 位十六进制（共 42 字符）`,
        `    请编辑 ${configPath}，将 REPLACE_* 占位符换成真实地址，或改用 username`,
        `    获取方式见 docs/USER_GUIDE.md 第 5 节`,
      ].join("\n");
    }
    if (err.path.includes("username")) {
      return `  • ${path}: 请填写 Polymarket 用户名（不要带 @），或删除 username 改用 address`;
    }
    return `  • ${path}: ${err.message}`;
  });
  return `config.yaml 校验失败:\n${lines.join("\n")}`;
}

function normalizePrivateKey(raw: string): string | null {
  const s = raw.trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(s)) return s;
  if (/^[a-fA-F0-9]{64}$/.test(s)) return `0x${s}`;
  return null;
}

function resolveTradingBackend(_walletEnv: string): TradingBackendKind {
  const suffix = _walletEnv.trim();
  const explicit = (
    process.env[envVarName("POLYMARKET_TRADING_BACKEND", suffix)] ??
    (suffix ? undefined : process.env.POLYMARKET_TRADING_BACKEND)
  )?.trim();
  if (explicit === "clob-v2") {
    console.warn(
      "Warning: POLYMARKET_TRADING_BACKEND=clob-v2 is removed — using secure (@polymarket/client)."
    );
  }
  return "secure";
}

function resolveSignatureType(
  privateKey: string,
  proxyAddress: string,
  explicit: string | undefined
): number {
  if (explicit !== undefined && explicit.trim() !== "") {
    return parseInt(explicit, 10);
  }
  const eoa = new Wallet(privateKey).address.toLowerCase();
  return proxyAddress.toLowerCase() !== eoa ? 1 : 0;
}

export function loadWalletConfig(walletEnv = ""): WalletConfig {
  const suffix = walletEnv.trim();
  const privateKeyRaw =
    process.env[envVarName("POLYMARKET_PRIVATE_KEY", suffix)] ??
    (suffix ? "" : process.env.POLYMARKET_PRIVATE_KEY ?? "");
  const proxyAddress = (
    process.env[envVarName("POLYMARKET_ADDRESS", suffix)] ??
    (suffix ? "" : process.env.POLYMARKET_ADDRESS ?? "")
  ).trim();

  const privateKey = normalizePrivateKey(privateKeyRaw);
  if (!privateKey) {
    const hint = suffix
      ? `POLYMARKET_PRIVATE_KEY_${suffix.toUpperCase()}`
      : "POLYMARKET_PRIVATE_KEY";
    throw new Error(`${hint} is required (64 hex chars, 0x optional)`);
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(proxyAddress)) {
    const hint = suffix
      ? `POLYMARKET_ADDRESS_${suffix.toUpperCase()}`
      : "POLYMARKET_ADDRESS";
    throw new Error(`${hint} is required (0x + 40 hex)`);
  }

  const signatureType = resolveSignatureType(
    privateKey,
    proxyAddress,
    process.env[envVarName("POLYMARKET_SIGNATURE_TYPE", suffix)] ??
      (suffix ? undefined : process.env.POLYMARKET_SIGNATURE_TYPE)
  );

  const tradingBackend = resolveTradingBackend(suffix);

  const chainIdRaw =
    process.env[envVarName("POLYMARKET_CHAIN_ID", suffix)] ??
    (suffix ? undefined : process.env.POLYMARKET_CHAIN_ID);
  const clobUrlRaw =
    process.env[envVarName("POLYMARKET_CLOB_URL", suffix)] ??
    (suffix ? undefined : process.env.POLYMARKET_CLOB_URL);
  const dataApiUrlRaw =
    process.env[envVarName("POLYMARKET_DATA_API_URL", suffix)] ??
    (suffix ? undefined : process.env.POLYMARKET_DATA_API_URL);

  const relayerApiKey =
    process.env[envVarName("RELAYER_API_KEY", suffix)]?.trim() ||
    (!suffix ? process.env.RELAYER_API_KEY?.trim() : undefined) ||
    undefined;
  const relayerApiKeyAddress =
    process.env[envVarName("RELAYER_API_KEY_ADDRESS", suffix)]?.trim() ||
    (!suffix ? process.env.RELAYER_API_KEY_ADDRESS?.trim() : undefined) ||
    undefined;

  return {
    privateKey,
    proxyAddress,
    signatureType,
    chainId: parseInt(chainIdRaw ?? "137", 10),
    clobUrl: (clobUrlRaw ?? "https://clob.polymarket.com").replace(/\/$/, ""),
    dataApiUrl: (dataApiUrlRaw ?? "https://data-api.polymarket.com").replace(/\/$/, ""),
    apiKey:
      process.env[envVarName("POLYMARKET_API_KEY", suffix)]?.trim() ||
      (!suffix ? process.env.POLYMARKET_API_KEY?.trim() : undefined) ||
      undefined,
    apiSecret:
      process.env[envVarName("POLYMARKET_API_SECRET", suffix)]?.trim() ||
      (!suffix ? process.env.POLYMARKET_API_SECRET?.trim() : undefined) ||
      undefined,
    apiPassphrase:
      process.env[envVarName("POLYMARKET_API_PASSPHRASE", suffix)]?.trim() ||
      (!suffix ? process.env.POLYMARKET_API_PASSPHRASE?.trim() : undefined) ||
      undefined,
    tradingBackend,
    relayerApiKey,
    relayerApiKeyAddress,
  };
}

function mapGlobal(raw: GlobalYaml) {
  return {
    pollIntervalMs: raw.poll_interval_ms,
    activityLimit: raw.activity_limit,
    previewMode: raw.preview_mode,
    copyTradesOnly: raw.copy_trades_only,
    maxTradeAgeHours: raw.max_trade_age_hours,
    buyDedupWindowMs: raw.buy_dedup_window_ms,
    tradeAggregationWindowMs: raw.trade_aggregation_window_ms,
    healthPort: parseInt(process.env.HEALTH_PORT ?? String(raw.health_port), 10),
    risk: {
      enableCopyTrading: raw.risk.enable_copy_trading,
      dailyLossCapPct: raw.risk.daily_loss_cap_pct,
      startingCapitalUsd: raw.risk.starting_capital_usd,
      maxDailyVolumeUsd: raw.risk.max_daily_volume_usd,
      maxOpenMarkets: raw.risk.max_open_markets,
      maxOrderUsd: raw.risk.max_order_usd,
      minOrderUsd: raw.risk.min_order_usd,
      slippageTolerance: raw.risk.slippage_tolerance,
      maxPositionPerTokenUsd: raw.risk.max_position_per_token_usd,
      positionCapBasis: raw.risk.position_cap_basis,
      syncWalletBalance: raw.risk.sync_wallet_balance,
    },
    execution: {
      orderType: raw.execution.order_type,
      retryLimit: raw.execution.retry_limit,
      networkRetryLimit: raw.execution.network_retry_limit,
      gtcFillTimeoutMs: raw.execution.gtc_fill_timeout_ms,
      pendingOrderMaxAgeHours: raw.execution.pending_order_max_age_hours,
      autoRedeemOnChain: raw.execution.auto_redeem_on_chain,
    },
    conflict: {
      mode: raw.conflict.mode,
      priority: raw.conflict.priority,
    },
    notify: {
      telegramOnCopy: raw.notify.telegram_on_copy,
      telegramOnError: raw.notify.telegram_on_error,
      telegramOnKillSwitch: raw.notify.telegram_on_kill_switch,
    },
    proxy: {
      mode: (raw.proxy.mode === "fixed"
        ? "static"
        : raw.proxy.mode === "static" || raw.proxy.mode === "dynamic"
          ? raw.proxy.mode
          : "none") as ProxyMode,
      staticUrl: raw.proxy.static_url ?? "",
      dynamicUrl: raw.proxy.dynamic_url ?? "",
      dynamicRotateSession: raw.proxy.dynamic_rotate_session ?? true,
    },
  };
}

function mapLeader(l: LeaderYaml): LeaderConfig {
  return {
    id: l.id,
    address: l.address,
    username: l.username,
    enabled: l.enabled,
    weight: l.weight,
    strategy: {
      type: l.strategy.type,
      copySize: l.strategy.copy_size,
      tieredMultipliers: l.strategy.tiered_multipliers,
      adaptiveMinPercent: l.strategy.adaptive_min_percent,
      adaptiveMaxPercent: l.strategy.adaptive_max_percent,
      adaptiveThresholdUsd: l.strategy.adaptive_threshold_usd,
    },
    limits: l.limits
      ? {
          maxOrderUsd: l.limits.max_order_usd,
          maxPositionUsd: l.limits.max_position_usd,
          maxDailyVolumeUsd: l.limits.max_daily_volume_usd,
        }
      : undefined,
    filters: l.filters
      ? {
          minPrice: l.filters.min_price,
          maxPrice: l.filters.max_price,
          sides: l.filters.sides,
          marketsAllowlist: l.filters.markets_allowlist,
          marketsBlocklist: l.filters.markets_blocklist,
        }
      : undefined,
  };
}

export function mapAccountToRuntime(
  normalized: NormalizedConfigDocument,
  accountId: string
): AccountDefinition {
  const account = normalized.accounts.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(`Account not found in config: ${accountId}`);
  }

  const mergedGlobal = accountMergedGlobal(normalized, account);
  const previewMode = mergedGlobal.preview_mode;
  const app: AppConfig = {
    global: mapGlobal(mergedGlobal),
    leaders: account.leaders.map(mapLeader),
  };
  const wallet = loadWalletConfig(account.wallet_env);

  return {
    id: account.id,
    label: account.label || account.id,
    enabled: account.enabled,
    walletEnv: account.wallet_env,
    config: { app, wallet },
    dbPath: resolveAccountDbPath(account.id, previewMode),
  };
}

export function readNormalizedConfig(configPath: string): NormalizedConfigDocument {
  const resolved = resolve(process.cwd(), configPath);
  if (!existsSync(resolved)) {
    throw new Error(`Config not found: ${resolved} (copy config.example.yaml to config.yaml)`);
  }

  const yamlDoc = sanitizeLeaderPlaceholders(parseYaml(readFileSync(resolved, "utf8")));
  try {
    return normalizeConfigDocument(yamlDoc);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(formatConfigValidationError(e, resolved));
    }
    throw e;
  }
}

/** Disabled leaders may keep template placeholders; strip invalid addresses before Zod parse. */
export function sanitizeLeaderPlaceholders(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = raw as { leaders?: unknown[]; accounts?: { leaders?: unknown[] }[] };

  const sanitizeLeaderList = (leaders: unknown[] | undefined): unknown[] | undefined => {
    if (!Array.isArray(leaders)) return leaders;
    return leaders.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const leader = { ...(entry as Record<string, unknown>) };
      const id = String(leader.id ?? "?");
      let enabled = leader.enabled !== false;

      const address = typeof leader.address === "string" ? leader.address.trim() : "";
      const usernameRaw = typeof leader.username === "string" ? leader.username.trim() : "";
      const addressValid = Boolean(address && ADDRESS_RE.test(address));
      const usernameValid = Boolean(usernameRaw && !isTemplatePlaceholder(usernameRaw));

      if (address && !addressValid) {
        if (enabled) {
          enabled = false;
          leader.enabled = false;
          console.warn(
            `Warning: Leader "${id}" has invalid address — auto-disabled. ` +
              `Set a real proxy address in config.yaml or via Dashboard (/leaders).`
          );
        }
        delete leader.address;
      }

      if (usernameRaw && !usernameValid) {
        if (enabled) {
          enabled = false;
          leader.enabled = false;
          console.warn(
            `Warning: Leader "${id}" has placeholder username — auto-disabled. ` +
              `Set a real Polymarket username in config.yaml or via Dashboard.`
          );
        }
        delete leader.username;
      }

      leader.enabled = enabled;
      return leader;
    });
  };

  if (Array.isArray(doc.leaders)) {
    doc.leaders = sanitizeLeaderList(doc.leaders);
  }
  if (Array.isArray(doc.accounts)) {
    doc.accounts = doc.accounts.map((acc) => {
      if (!acc || typeof acc !== "object") return acc;
      return { ...acc, leaders: sanitizeLeaderList(acc.leaders) };
    });
  }

  return doc;
}

export function loadMultiAccountConfig(configPath = "config.yaml"): MultiAccountConfig {
  const resolved = resolve(process.cwd(), configPath);
  const normalized = readNormalizedConfig(configPath);
  applyProxyFromYaml(normalized.defaultsGlobal.proxy);

  const accounts: AccountDefinition[] = [];
  for (const account of normalized.accounts) {
    try {
      accounts.push(mapAccountToRuntime(normalized, account.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (account.enabled) {
        throw new Error(`Account "${account.id}": ${msg}`);
      }
      console.warn(`Warning: disabled account "${account.id}" skipped — ${msg}`);
    }
  }

  if (accounts.length === 0) {
    throw new Error("No valid accounts in config.yaml");
  }

  const enabledCount = accounts.filter((a) => a.enabled).length;
  if (enabledCount === 0) {
    console.warn("Warning: no enabled accounts in config.yaml");
  }

  const pollIntervalMs = Math.min(...accounts.map((a) => a.config.app.global.pollIntervalMs));
  const healthPort = accounts[0]!.config.app.global.healthPort;

  return {
    configPath: resolved,
    pollIntervalMs,
    healthPort,
    accounts,
    defaultAccountId: accounts[0]!.id,
  };
}

/** Backward-compatible: returns first account runtime config. */
export function loadConfig(configPath = "config.yaml"): RuntimeConfig {
  const multi = loadMultiAccountConfig(configPath);
  const first = multi.accounts.find((a) => a.enabled) ?? multi.accounts[0]!;
  return first.config;
}

export function validateRuntime(config: RuntimeConfig): string | null {
  const { wallet, app } = config;
  const eoa = new Wallet(wallet.privateKey).address.toLowerCase();
  if (wallet.proxyAddress.toLowerCase() !== eoa && wallet.signatureType === 0) {
    return "POLYMARKET_ADDRESS differs from EOA; set POLYMARKET_SIGNATURE_TYPE=1 for proxy wallet";
  }
  if (
    !app.global.previewMode &&
    wallet.tradingBackend === "secure" &&
    (!wallet.relayerApiKey || !wallet.relayerApiKeyAddress)
  ) {
    console.warn(
      "Warning: RELAYER_API_KEY not set — required for first-time approval setup and relayer-deployed wallets."
    );
  }
  if (!app.global.previewMode && app.global.risk.slippageTolerance <= 0) {
    console.warn(
      "Warning: slippage_tolerance is 0 in LIVE mode — orders use the leader's (possibly stale) price " +
        "with no reference-price check. Set a positive slippage_tolerance to guard against price drift."
    );
  }
  if (!app.global.risk.enableCopyTrading && !app.global.previewMode) {
    return "Copy trading disabled and preview_mode is false — nothing will run";
  }
  for (const l of app.leaders.filter((x) => x.enabled)) {
    if (!l.address && !l.username) {
      return `Leader ${l.id}: address or username required`;
    }
  }
  return null;
}

export function validateAllAccounts(accounts: AccountDefinition[]): string | null {
  for (const account of accounts.filter((a) => a.enabled)) {
    const err = validateRuntime(account.config);
    if (err) return `Account "${account.id}": ${err}`;
  }
  return null;
}
