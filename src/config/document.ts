import { z } from "zod";

export const tradeSide = z.enum(["BUY", "SELL"]);
export const copyStrategy = z.enum(["PERCENTAGE", "FIXED", "ADAPTIVE"]);
export const orderType = z.enum(["GTC", "FAK", "FOK"]);
export const conflictMode = z.enum(["skip_both", "net", "priority_leader"]);
export const proxyMode = z.enum(["none", "static", "dynamic", "fixed"]);

export const proxyYamlSchema = z
  .object({
    mode: proxyMode.default("none"),
    static_url: z.string().default(""),
    dynamic_url: z.string().default(""),
    dynamic_rotate_session: z.boolean().default(true),
  })
  .default({});

export const globalYamlSchema = z.object({
  poll_interval_ms: z.number().int().min(1000).default(5000),
  activity_limit: z.number().int().min(10).max(500).default(100),
  preview_mode: z.boolean().default(true),
  copy_trades_only: z.boolean().default(true),
  max_trade_age_hours: z.number().positive().default(1),
  buy_dedup_window_ms: z.number().int().nonnegative().default(60000),
  trade_aggregation_window_ms: z.number().int().nonnegative().default(0),
  health_port: z.number().int().min(0).max(65535).default(8080),
  risk: z.object({
    enable_copy_trading: z.boolean().default(true),
    daily_loss_cap_pct: z.number().positive().default(20),
    starting_capital_usd: z.number().positive().default(1000),
    max_daily_volume_usd: z.number().nonnegative().default(2000),
    max_open_markets: z.number().int().positive().default(30),
    max_order_usd: z.number().positive().default(50),
    min_order_usd: z.number().positive().default(1),
    slippage_tolerance: z.number().nonnegative().default(0.03),
    max_position_per_token_usd: z.number().nonnegative().default(0),
    position_cap_basis: z.enum(["market", "cost"]).default("market"),
    sync_wallet_balance: z.boolean().default(true),
  }),
  execution: z.object({
    order_type: orderType.default("GTC"),
    retry_limit: z.number().int().nonnegative().default(3),
    network_retry_limit: z.number().int().nonnegative().default(3),
    gtc_fill_timeout_ms: z.number().int().nonnegative().default(10000),
    pending_order_max_age_hours: z.number().positive().default(48),
  }),
  conflict: z.object({
    mode: conflictMode.default("priority_leader"),
    priority: z.array(z.string()).default([]),
  }),
  notify: z
    .object({
      telegram_on_copy: z.boolean().default(true),
      telegram_on_error: z.boolean().default(true),
      telegram_on_kill_switch: z.boolean().default(true),
    })
    .default({}),
  proxy: proxyYamlSchema,
});

export const leaderYamlSchema = z
  .object({
    id: z.string().min(1),
    address: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    username: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
    weight: z.number().positive().default(1),
    strategy: z.object({
      type: copyStrategy,
      copy_size: z.number().positive(),
      tiered_multipliers: z.string().optional(),
      adaptive_min_percent: z.number().positive().optional(),
      adaptive_max_percent: z.number().positive().optional(),
      adaptive_threshold_usd: z.number().positive().optional(),
    }),
    limits: z
      .object({
        max_order_usd: z.number().positive().optional(),
        max_position_usd: z.number().positive().optional(),
        max_daily_volume_usd: z.number().positive().optional(),
      })
      .optional(),
    filters: z
      .object({
        min_price: z.number().min(0).max(1).optional(),
        max_price: z.number().min(0).max(1).optional(),
        sides: z.array(tradeSide).optional(),
        markets_allowlist: z.array(z.string()).optional(),
        markets_blocklist: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .refine((l) => !l.enabled || Boolean(l.address || l.username), {
    message: "leader requires address or username",
  });

export type LeaderYaml = z.infer<typeof leaderYamlSchema>;
export type GlobalYaml = z.infer<typeof globalYamlSchema>;

/** Legacy single-account config.yaml */
export const legacyAppConfigSchema = z.object({
  global: globalYamlSchema,
  leaders: z.array(leaderYamlSchema).default([]),
});

export type LegacyAppConfigDocument = z.infer<typeof legacyAppConfigSchema>;

export const accountYamlSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "account id: letters, numbers, _ and - only"),
  label: z.string().default(""),
  enabled: z.boolean().default(true),
  wallet_env: z.string().default(""),
  global: globalYamlSchema.partial().optional(),
  leaders: z.array(leaderYamlSchema).default([]),
});

export type AccountYaml = z.infer<typeof accountYamlSchema>;

export const multiAppConfigSchema = z.object({
  defaults: z
    .object({
      global: globalYamlSchema,
    })
    .optional(),
  accounts: z.array(accountYamlSchema).min(1),
});

export type MultiAppConfigDocument = z.infer<typeof multiAppConfigSchema>;

export type ConfigStorageFormat = "legacy" | "multi";

export interface NormalizedConfigDocument {
  format: ConfigStorageFormat;
  defaultsGlobal: GlobalYaml;
  accounts: AccountYaml[];
}

export type AppConfigDocument = LegacyAppConfigDocument;

/** Alias for legacy schema — used by write.ts */
export const appConfigSchema = legacyAppConfigSchema;

export function deepMergeGlobal(base: GlobalYaml, overrides?: Partial<GlobalYaml>): GlobalYaml {
  if (!overrides) return globalYamlSchema.parse(base);
  const merged = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined) continue;
    if (typeof val === "object" && val !== null && !Array.isArray(val) && merged[key]) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(val as Record<string, unknown>) };
    } else {
      merged[key] = val;
    }
  }
  return globalYamlSchema.parse(merged);
}

export function normalizeConfigDocument(raw: unknown): NormalizedConfigDocument {
  if (!raw || typeof raw !== "object") {
    throw new Error("config.yaml must be a YAML object");
  }

  const doc = raw as Record<string, unknown>;

  if (Array.isArray(doc.accounts) && doc.accounts.length > 0) {
    const parsed = multiAppConfigSchema.parse(doc);
    const defaultsGlobal = parsed.defaults?.global ?? globalYamlSchema.parse({});
    return {
      format: "multi",
      defaultsGlobal,
      accounts: parsed.accounts,
    };
  }

  const legacy = legacyAppConfigSchema.parse(doc);
  return {
    format: "legacy",
    defaultsGlobal: legacy.global,
    accounts: [
      {
        id: "default",
        label: "默认账户",
        enabled: true,
        wallet_env: "",
        leaders: legacy.leaders,
      },
    ],
  };
}

export function accountMergedGlobal(
  normalized: NormalizedConfigDocument,
  account: AccountYaml
): GlobalYaml {
  if (normalized.format === "legacy") {
    return normalized.defaultsGlobal;
  }
  return deepMergeGlobal(normalized.defaultsGlobal, account.global);
}

export function findAccountYaml(
  normalized: NormalizedConfigDocument,
  accountId: string
): AccountYaml | undefined {
  return normalized.accounts.find((a) => a.id === accountId);
}

export function toLegacyDocument(normalized: NormalizedConfigDocument): LegacyAppConfigDocument {
  const account = normalized.accounts[0];
  if (!account) throw new Error("No accounts in config");
  return {
    global: accountMergedGlobal(normalized, account),
    leaders: account.leaders,
  };
}

export function toMultiDocument(normalized: NormalizedConfigDocument): MultiAppConfigDocument {
  if (normalized.format === "multi") {
    return {
      defaults: { global: normalized.defaultsGlobal },
      accounts: normalized.accounts.map((a) => ({
        ...a,
        global: a.global,
      })),
    };
  }
  const account = normalized.accounts[0]!;
  return {
    defaults: { global: normalized.defaultsGlobal },
    accounts: [
      {
        id: account.id,
        label: account.label,
        enabled: account.enabled,
        wallet_env: account.wallet_env,
        leaders: account.leaders,
      },
    ],
  };
}
