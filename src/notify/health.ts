import type { CopyCycleResult } from "../engine/copy-cycle.js";

export interface HealthSnapshot {
  startedAt: number;
  previewMode: boolean;
  lastPollAt: number | null;
  lastPollResult: CopyCycleResult | null;
  killSwitchActive: boolean;
  enabledLeaders: string[];
  lastError: string | null;
  pendingOrders: number;
  walletDrifts: string[];
}

/** Process-level health summary (aggregated across accounts). */
export const healthSnapshot: HealthSnapshot = {
  startedAt: Date.now(),
  previewMode: true,
  lastPollAt: null,
  lastPollResult: null,
  killSwitchActive: false,
  enabledLeaders: [],
  lastError: null,
  pendingOrders: 0,
  walletDrifts: [],
};

export function syncAggregateHealth(
  accounts: {
    health: {
      previewMode: boolean;
      lastPollAt: number | null;
      lastPollResult: CopyCycleResult | null;
      killSwitchActive: boolean;
      enabledLeaders: string[];
      lastError: string | null;
      pendingOrders: number;
      walletDrifts: string[];
    };
  }[]
): void {
  if (accounts.length === 0) return;

  healthSnapshot.previewMode = accounts.every((a) => a.health.previewMode);
  healthSnapshot.killSwitchActive = accounts.some((a) => a.health.killSwitchActive);
  healthSnapshot.enabledLeaders = accounts.flatMap((a) => a.health.enabledLeaders);
  healthSnapshot.pendingOrders = accounts.reduce((s, a) => s + a.health.pendingOrders, 0);
  healthSnapshot.walletDrifts = accounts.flatMap((a) => a.health.walletDrifts);

  const withPoll = accounts
    .filter((a) => a.health.lastPollAt)
    .sort((a, b) => (b.health.lastPollAt ?? 0) - (a.health.lastPollAt ?? 0));
  const latest = withPoll[0];
  if (latest) {
    healthSnapshot.lastPollAt = latest.health.lastPollAt;
    healthSnapshot.lastPollResult = latest.health.lastPollResult;
    healthSnapshot.lastError = latest.health.lastError;
  }
}

/** @deprecated use AccountManager.updateHealthAfterPoll */
export function updateHealthAfterPoll(
  result: CopyCycleResult,
  killSwitchActive: boolean
): void {
  healthSnapshot.lastPollAt = Date.now();
  healthSnapshot.lastPollResult = result;
  healthSnapshot.killSwitchActive = killSwitchActive;
  if (result.errors.length > 0) {
    healthSnapshot.lastError = result.errors[0] ?? null;
  }
}
