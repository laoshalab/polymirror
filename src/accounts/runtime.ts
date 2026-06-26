import type { CopyCycleResult } from "../engine/copy-cycle.js";
import type { RuntimeConfig } from "../config/types.js";
import type { StateStore } from "../state/store.js";

export interface AccountHealthSlice {
  previewMode: boolean;
  lastPollAt: number | null;
  lastPollResult: CopyCycleResult | null;
  killSwitchActive: boolean;
  enabledLeaders: string[];
  lastError: string | null;
  pendingOrders: number;
  walletDrifts: string[];
}

export function newAccountHealth(config: RuntimeConfig): AccountHealthSlice {
  return {
    previewMode: config.app.global.previewMode,
    lastPollAt: null,
    lastPollResult: null,
    killSwitchActive: false,
    enabledLeaders: config.app.leaders.filter((l) => l.enabled).map((l) => l.id),
    lastError: null,
    pendingOrders: 0,
    walletDrifts: [],
  };
}

export interface AccountRuntime {
  id: string;
  label: string;
  enabled: boolean;
  walletEnv: string;
  config: RuntimeConfig;
  store: StateStore;
  dbPath: string;
  health: AccountHealthSlice;
}

export function updateAccountHealthAfterPoll(
  health: AccountHealthSlice,
  result: CopyCycleResult,
  killSwitchActive: boolean,
  pendingOrders: number,
  walletDrifts: string[]
): void {
  health.lastPollAt = Date.now();
  health.lastPollResult = result;
  health.killSwitchActive = killSwitchActive;
  health.pendingOrders = pendingOrders;
  health.walletDrifts = walletDrifts;
  if (result.errors.length > 0) {
    health.lastError = result.errors[0] ?? null;
  }
}
