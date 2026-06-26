import { apiGet, apiPatch, apiPost } from "./leaders";

export interface RiskSnapshot {
  killSwitchActive: boolean;
  copyTradingEnabled: boolean;
  previewMode: boolean;
  daily: {
    date: string;
    volumeUsd: number;
    maxDailyVolumeUsd: number;
    realizedPnl: number;
    startingCapitalUsd: number;
    dailyLossCapPct: number;
    lossPct: number;
    copyCount: number;
  };
  openMarkets: { current: number; max: number };
  leaderVolumes: {
    leaderId: string;
    enabled: boolean;
    volumeUsd: number;
    maxDailyVolumeUsd: number | null;
  }[];
  tokenExposure: {
    tokenId: string;
    shares: number;
    exposureUsd: number;
    capUsd: number | null;
  }[];
  walletDrifts: string[];
  lastError: string | null;
}

export interface SettingsSnapshot {
  global: {
    pollIntervalMs: number;
    activityLimit: number;
    previewMode: boolean;
    copyTradesOnly: boolean;
    maxTradeAgeHours: number;
    buyDedupWindowMs: number;
    tradeAggregationWindowMs: number;
    healthPort: number;
    risk: {
      enableCopyTrading: boolean;
      dailyLossCapPct: number;
      startingCapitalUsd: number;
      maxDailyVolumeUsd: number;
      maxOpenMarkets: number;
      maxOrderUsd: number;
      minOrderUsd: number;
      slippageTolerance: number;
      maxPositionPerTokenUsd: number;
      positionCapBasis: "market" | "cost";
      syncWalletBalance: boolean;
    };
    execution: {
      orderType: string;
      retryLimit: number;
      networkRetryLimit: number;
      gtcFillTimeoutMs: number;
      pendingOrderMaxAgeHours: number;
    };
    conflict: { mode: string; priority: string[] };
    notify: {
      telegramOnCopy: boolean;
      telegramOnError: boolean;
      telegramOnKillSwitch: boolean;
    };
    proxy: {
      mode: "none" | "static" | "dynamic";
      staticUrl: string;
      dynamicUrl: string;
      staticUrlConfigured: boolean;
      dynamicUrlConfigured: boolean;
      dynamicRotateSession: boolean;
    };
  };
  env: {
    telegramConfigured: boolean;
    telegramTokenSet: boolean;
    telegramChatSet: boolean;
    liveConfirmSet: boolean;
    requireLiveConfirm: boolean;
    walletAddress: string;
    hasHttpsProxy: boolean;
    proxy: {
      configured: boolean;
      mode: "none" | "static" | "dynamic";
      source: "yaml" | "env" | "none";
      urlMasked: string;
      envFallback: boolean;
    };
  };
  configPath: string;
  dbPath: string;
  previewMode: boolean;
}

export const fetchRisk = () => apiGet<RiskSnapshot>("/api/risk");
export const fetchSettings = () => apiGet<SettingsSnapshot>("/api/settings");
export const patchGlobalSettings = (body: Record<string, unknown>) =>
  apiPatch<{ ok: boolean; settings: SettingsSnapshot }>("/api/settings/global", body);
export const resetKillSwitch = () =>
  apiPost<{ ok: boolean; risk: RiskSnapshot }>("/api/kill-switch/reset", {});
export const stopCopyTrading = () =>
  apiPost<{ ok: boolean; previewMode: boolean; copyTradingEnabled: boolean; risk: RiskSnapshot }>(
    "/api/copy-trading/stop",
    {}
  );
export const switchPreviewMode = () =>
  apiPost<{ ok: boolean; previewMode: boolean; message: string }>("/api/mode/preview", {});
export const switchLiveMode = () =>
  apiPost<{ ok: boolean; previewMode: boolean; message: string }>("/api/mode/live", {});
export const reloadConfig = () => apiPost<{ ok: boolean }>("/api/config/reload", {});

export interface ProxyTestResult {
  ok: boolean;
  message?: string;
  error?: string;
  hint?: string;
  mode?: string;
  source?: string;
  urlMasked?: string;
}

export const testProxyConnection = () =>
  apiPost<ProxyTestResult>("/api/settings/proxy/test", {});

export interface TelegramPatchResult {
  ok: boolean;
  telegramConfigured: boolean;
  telegramTokenSet: boolean;
  telegramChatSet: boolean;
  message: string;
}

export const patchTelegramSettings = (body: { botToken?: string; chatId?: string }) =>
  apiPatch<TelegramPatchResult>("/api/settings/telegram", body);
