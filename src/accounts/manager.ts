import { resolveLeaderAddresses } from "../leaders/resolve.js";
import {
  loadMultiAccountConfig,
  mapAccountToRuntime,
  readNormalizedConfig,
  validateAllAccounts,
} from "../config/load.js";
import type { AccountDefinition, MultiAccountConfig, RuntimeConfig } from "../config/types.js";
import { StateStore } from "../state/store.js";
import {
  newAccountHealth,
  updateAccountHealthAfterPoll,
  type AccountRuntime,
} from "./runtime.js";
import { resolveAccountDbPath } from "../state/db-path.js";
import { logInfo } from "../notify/logger.js";
import type { CopyCycleResult } from "../engine/copy-cycle.js";
import {
  readNormalizedConfigDocument,
  writeNormalizedConfigDocument,
  type NormalizedConfigDocument,
} from "../config/write.js";
import { assertLiveTradingAllowed, assertLiveTradingForAccounts } from "../engine/risk.js";
import { applyProxyFromYaml } from "../util/proxy.js";

export interface AccountApiContext {
  accountId: string;
  label: string;
  enabled: boolean;
  getConfig: () => RuntimeConfig;
  store: StateStore;
  dbPath: string;
  configPath: string;
  reloadConfig: () => Promise<void>;
}

export class AccountManager {
  private runtimes = new Map<string, AccountRuntime>();
  private normalized: NormalizedConfigDocument;
  readonly configPath: string;
  readonly configFileKey: string;
  readonly defaultAccountId: string;
  pollIntervalMs: number;
  healthPort: number;

  private constructor(
    configPath: string,
    configFileKey: string,
    multi: MultiAccountConfig,
    normalized: NormalizedConfigDocument,
    runtimes: AccountRuntime[]
  ) {
    this.configPath = configPath;
    this.configFileKey = configFileKey;
    this.defaultAccountId = multi.defaultAccountId;
    this.pollIntervalMs = multi.pollIntervalMs;
    this.healthPort = multi.healthPort;
    this.normalized = normalized;
    for (const rt of runtimes) {
      this.runtimes.set(rt.id, rt);
    }
  }

  static async create(configFileKey = "config.yaml"): Promise<AccountManager> {
    const multi = loadMultiAccountConfig(configFileKey);
    const validationError = validateAllAccounts(multi.accounts);
    if (validationError) {
      throw new Error(validationError);
    }

    const normalized = readNormalizedConfig(configFileKey);
    const runtimes: AccountRuntime[] = [];

    for (const def of multi.accounts) {
      const resolvedLeaders = await resolveLeaderAddresses(def.config.app.leaders);
      const config: RuntimeConfig = {
        wallet: def.config.wallet,
        app: { ...def.config.app, leaders: resolvedLeaders },
      };

      const store = new StateStore(def.dbPath);
      runtimes.push({
        id: def.id,
        label: def.label,
        enabled: def.enabled,
        walletEnv: def.walletEnv,
        config,
        store,
        dbPath: def.dbPath,
        health: newAccountHealth(config),
      });
    }

    return new AccountManager(multi.configPath, configFileKey, multi, normalized, runtimes);
  }

  list(): AccountRuntime[] {
    return [...this.runtimes.values()];
  }

  enabled(): AccountRuntime[] {
    return this.list().filter((a) => a.enabled);
  }

  get(accountId: string): AccountRuntime | undefined {
    return this.runtimes.get(accountId);
  }

  require(accountId: string): AccountRuntime {
    const rt = this.get(accountId);
    if (!rt) throw new Error(`Account not found: ${accountId}`);
    return rt;
  }

  resolveAccountId(accountId?: string | null): string {
    const id = accountId?.trim();
    if (id && this.runtimes.has(id)) return id;
    if (id && !this.runtimes.has(id)) throw new Error(`Account not found: ${id}`);
    return this.defaultAccountId;
  }

  toApiContext(accountId?: string | null): AccountApiContext {
    const id = this.resolveAccountId(accountId);
    const rt = this.require(id);
    return {
      accountId: id,
      label: rt.label,
      enabled: rt.enabled,
      getConfig: () => rt.config,
      store: rt.store,
      dbPath: rt.dbPath,
      configPath: this.configPath,
      reloadConfig: () => this.reloadConfig(),
    };
  }

  getNormalized(): NormalizedConfigDocument {
    return this.normalized;
  }

  async reloadConfig(): Promise<void> {
    this.normalized = readNormalizedConfig(this.configFileKey);
    const multi = loadMultiAccountConfig(this.configFileKey);
    assertLiveTradingForAccounts(multi.accounts);
    applyProxyFromYaml(this.normalized.defaultsGlobal.proxy);
    this.pollIntervalMs = multi.pollIntervalMs;
    this.healthPort = multi.healthPort;

    const configIds = new Set(multi.accounts.map((a) => a.id));
    for (const id of [...this.runtimes.keys()]) {
      if (!configIds.has(id)) {
        const stale = this.runtimes.get(id)!;
        stale.store.close();
        this.runtimes.delete(id);
        logInfo("Account removed on config reload", { accountId: id });
      }
    }

    for (const def of multi.accounts) {
      const resolvedLeaders = await resolveLeaderAddresses(def.config.app.leaders);
      const config: RuntimeConfig = {
        wallet: def.config.wallet,
        app: { ...def.config.app, leaders: resolvedLeaders },
      };

      let rt = this.runtimes.get(def.id);
      const previewMode = config.app.global.previewMode;
      const dbPath = resolveAccountDbPath(def.id, previewMode);

      if (!rt) {
        rt = {
          id: def.id,
          label: def.label,
          enabled: def.enabled,
          walletEnv: def.walletEnv,
          config,
          store: new StateStore(dbPath),
          dbPath,
          health: newAccountHealth(config),
        };
        this.runtimes.set(def.id, rt);
      } else {
        if (rt.dbPath !== dbPath) {
          rt.store.close();
          rt.store = new StateStore(dbPath);
          rt.dbPath = dbPath;
        }
        rt.label = def.label;
        rt.enabled = def.enabled;
        rt.walletEnv = def.walletEnv;
        rt.config = config;
        rt.health.previewMode = previewMode;
        rt.health.enabledLeaders = config.app.leaders.filter((l) => l.enabled).map((l) => l.id);
      }
    }

    logInfo("Config reloaded", {
      accounts: [...this.runtimes.keys()],
    });
  }

  updateHealthAfterPoll(
    accountId: string,
    result: CopyCycleResult,
    walletDrifts: string[]
  ): void {
    const rt = this.require(accountId);
    updateAccountHealthAfterPoll(
      rt.health,
      result,
      rt.store.isKillSwitchActive(),
      rt.store.listPendingOrders().length,
      walletDrifts
    );
  }

  closeAll(): void {
    for (const rt of this.runtimes.values()) {
      rt.store.close();
    }
  }

  buildAccountsSummary() {
    return this.list().map((rt) => {
      const today = rt.store.getTodayStats();
      return {
        id: rt.id,
        label: rt.label,
        enabled: rt.enabled,
        walletAddress: rt.config.wallet.proxyAddress,
        walletEnv: rt.walletEnv || null,
        previewMode: rt.config.app.global.previewMode,
        dbPath: rt.dbPath,
        killSwitchActive: rt.store.isKillSwitchActive(),
        enabledLeaders: rt.health.enabledLeaders,
        lastPollAt: rt.health.lastPollAt,
        lastPoll: rt.health.lastPollResult,
        todayVolumeUsd: today?.volumeUsd ?? rt.store.getDailyVolumeUsd(),
        todayCopyCount: today?.copyCount ?? 0,
        pendingOrders: rt.store.listPendingOrders().length,
      };
    });
  }

  writeNormalized(normalized: NormalizedConfigDocument): void {
    writeNormalizedConfigDocument(this.configPath, normalized);
    this.normalized = normalized;
  }

  readNormalizedFromDisk(): NormalizedConfigDocument {
    return readNormalizedConfigDocument(this.configPath);
  }

  mapDefinition(accountId: string): AccountDefinition {
    return mapAccountToRuntime(this.normalized, accountId);
  }
}
