export type CopyStrategyType = "PERCENTAGE" | "FIXED" | "ADAPTIVE";
export type OrderType = "GTC" | "FAK" | "FOK";
/** How `limits.max_position_usd` values a held position: live market price vs cost basis. */
export type PositionCapBasis = "market" | "cost";
export type ConflictMode = "skip_both" | "net" | "priority_leader";
export type TradeSide = "BUY" | "SELL";
export type TradingBackendKind = "secure";

export type ProxyMode = "none" | "static" | "dynamic";

export interface ProxyConfig {
  mode: ProxyMode;
  staticUrl: string;
  dynamicUrl: string;
  dynamicRotateSession: boolean;
}

export interface GlobalConfig {
  pollIntervalMs: number;
  activityLimit: number;
  previewMode: boolean;
  copyTradesOnly: boolean;
  maxTradeAgeHours: number;
  buyDedupWindowMs: number;
  tradeAggregationWindowMs: number;
  healthPort: number;
  risk: RiskConfig;
  execution: ExecutionConfig;
  conflict: ConflictConfig;
  notify: NotifyConfig;
  proxy: ProxyConfig;
}

export interface RiskConfig {
  enableCopyTrading: boolean;
  dailyLossCapPct: number;
  startingCapitalUsd: number;
  maxDailyVolumeUsd: number;
  maxOpenMarkets: number;
  maxOrderUsd: number;
  minOrderUsd: number;
  slippageTolerance: number;
  /** 0 = disabled. Caps combined wallet exposure per token across all leaders. */
  maxPositionPerTokenUsd: number;
  /**
   * Valuation used for per-leader `limits.max_position_usd`.
   * "market" (default): held shares × current trade price (mark-to-market).
   * "cost": held shares × average entry price (capital deployed).
   * Omitted ⇒ treated as "market".
   */
  positionCapBasis?: PositionCapBasis;
  /** Live: cross-check SELL against CLOB token balance. */
  syncWalletBalance: boolean;
}

export interface NotifyConfig {
  telegramOnCopy: boolean;
  telegramOnError: boolean;
  telegramOnKillSwitch: boolean;
}

export interface ExecutionConfig {
  orderType: OrderType;
  retryLimit: number;
  networkRetryLimit: number;
  /** Max ms to poll CLOB for GTC fill before applying partial/zero fill. */
  gtcFillTimeoutMs: number;
  /** Drop pending GTC orders older than this (hours). */
  pendingOrderMaxAgeHours: number;
  /** Live: redeem resolved positions on-chain via SecureClient (default on; set false for local-only). */
  autoRedeemOnChain: boolean;
}

export interface ConflictConfig {
  mode: ConflictMode;
  priority: string[];
}

export interface LeaderStrategy {
  type: CopyStrategyType;
  copySize: number;
  tieredMultipliers?: string;
  adaptiveMinPercent?: number;
  adaptiveMaxPercent?: number;
  adaptiveThresholdUsd?: number;
}

export interface LeaderLimits {
  maxOrderUsd?: number;
  maxPositionUsd?: number;
  maxDailyVolumeUsd?: number;
}

export interface LeaderFilters {
  minPrice?: number;
  maxPrice?: number;
  sides?: TradeSide[];
  marketsAllowlist?: string[];
  marketsBlocklist?: string[];
}

export interface LeaderConfig {
  id: string;
  address?: string;
  username?: string;
  enabled: boolean;
  weight: number;
  strategy: LeaderStrategy;
  limits?: LeaderLimits;
  filters?: LeaderFilters;
}

export interface AppConfig {
  global: GlobalConfig;
  leaders: LeaderConfig[];
}

export interface WalletConfig {
  privateKey: string;
  proxyAddress: string;
  signatureType: number;
  chainId: number;
  clobUrl: string;
  dataApiUrl: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
  /** Live order path via @polymarket/client SecureClient. */
  tradingBackend: TradingBackendKind;
  /** Relayer API key UUID from Polymarket Settings (gasless approvals). */
  relayerApiKey?: string;
  /** Address shown next to the Relayer API key in Polymarket Settings. */
  relayerApiKeyAddress?: string;
  /** Polymarket Builder Code (bytes32) — hardcoded; see `src/config/builder.ts`. */
  builderCode: string;
}

/** Single wallet + app config (one copy-trading account). */
export interface RuntimeConfig {
  app: AppConfig;
  wallet: WalletConfig;
}

/** Loaded account metadata + runtime config (no StateStore). */
export interface AccountDefinition {
  id: string;
  label: string;
  enabled: boolean;
  walletEnv: string;
  config: RuntimeConfig;
  dbPath: string;
}

/** Full multi-account bootstrap from config.yaml. */
export interface MultiAccountConfig {
  configPath: string;
  /** Shared poll interval (min across accounts or defaults). */
  pollIntervalMs: number;
  healthPort: number;
  accounts: AccountDefinition[];
  defaultAccountId: string;
}
