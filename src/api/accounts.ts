import { z } from "zod";
import { Wallet } from "@ethersproject/wallet";
import type { ApiContext } from "./routes.js";
import {
  createAccountSchema,
  normalizePrivateKey,
  resolvedSignatureType,
  resolvedSignatureTypeForWallet,
  updateAccountSchema,
} from "../config/account-schema.js";
import {
  applyEnvToProcess,
  upsertEnvFile,
  walletEnvKeys,
  walletEnvSuffix,
} from "../config/env-file.js";
import { loadWalletConfig } from "../config/load.js";
import {
  normalizeConfigDocument,
  type AccountYaml,
  type NormalizedConfigDocument,
} from "../config/document.js";
import { readNormalizedConfigDocument, writeNormalizedConfigDocument } from "../config/write.js";
import { syncAggregateHealth } from "../notify/health.js";
import { logInfo } from "../notify/logger.js";

function addAccountToNormalized(
  normalized: NormalizedConfigDocument,
  account: AccountYaml
): NormalizedConfigDocument {
  if (normalized.accounts.some((a) => a.id === account.id)) {
    throw new Error(`Account id already exists: ${account.id}`);
  }

  const accounts = [...normalized.accounts, account];
  if (normalized.format === "legacy") {
    return normalizeConfigDocument({
      defaults: { global: normalized.defaultsGlobal },
      accounts: accounts.map((a) => ({
        id: a.id,
        label: a.label,
        enabled: a.enabled,
        wallet_env: a.wallet_env,
        global: a.global,
        leaders: a.leaders,
      })),
    });
  }

  return normalizeConfigDocument({
    defaults: { global: normalized.defaultsGlobal },
    accounts,
  });
}

export async function createAccount(
  ctx: ApiContext,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  try {
    const input = createAccountSchema.parse(body);
    const normalized = readNormalizedConfigDocument(ctx.configPath);

    if (normalized.accounts.some((a) => a.id === input.id)) {
      return { status: 409, body: { error: `Account id already exists: ${input.id}` } };
    }

    const privateKey = normalizePrivateKey(input.privateKey)!;
    const walletEnv = walletEnvSuffix(input.id);
    const signatureType = resolvedSignatureType(input);

    const envUpdates = walletEnvKeys(walletEnv, {
      privateKey,
      address: input.address.trim(),
      signatureType: signatureType !== 0 ? signatureType : undefined,
    });
    upsertEnvFile(envUpdates);
    applyEnvToProcess(envUpdates);

    const newAccount: AccountYaml = {
      id: input.id,
      label: input.label?.trim() || input.id,
      enabled: input.enabled,
      wallet_env: walletEnv,
      leaders: [],
    };

    const next = addAccountToNormalized(normalized, newAccount);
    writeNormalizedConfigDocument(ctx.configPath, next);
    await ctx.reloadConfig();
    syncAggregateHealth(ctx.manager.list());

    const summary = ctx.manager.buildAccountsSummary().find((a) => a.id === input.id);
    logInfo("Account created via dashboard", {
      id: input.id,
      walletEnv: walletEnv || "(default)",
      address: `${input.address.slice(0, 6)}…${input.address.slice(-4)}`,
    });

    return {
      status: 201,
      body: {
        ok: true,
        account: summary,
        message: "账户已创建。私钥已写入 .env，不会在此显示。切换账户后即可配置 Leader。",
        restartHint:
          normalized.format === "legacy"
            ? "config.yaml 已迁移为多账户格式。"
            : undefined,
      },
    };
  } catch (e) {
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
}

function updateAccountInNormalized(
  normalized: NormalizedConfigDocument,
  accountId: string,
  patch: { label?: string; enabled?: boolean }
): NormalizedConfigDocument {
  const idx = normalized.accounts.findIndex((a) => a.id === accountId);
  if (idx < 0) throw new Error(`Account not found: ${accountId}`);

  const accounts = normalized.accounts.map((a) => {
    if (a.id !== accountId) return a;
    return {
      ...a,
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    };
  });

  if (normalized.format === "legacy") {
    return normalizeConfigDocument({
      global: normalized.defaultsGlobal,
      leaders: accounts[0]!.leaders,
    });
  }

  return normalizeConfigDocument({
    defaults: { global: normalized.defaultsGlobal },
    accounts,
  });
}

export async function updateAccount(
  ctx: ApiContext,
  accountId: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  try {
    const input = updateAccountSchema.parse(body);
    const normalized = readNormalizedConfigDocument(ctx.configPath);
    const existing = normalized.accounts.find((a) => a.id === accountId);
    if (!existing) {
      return { status: 404, body: { error: `Account not found: ${accountId}` } };
    }

    const pkRaw = input.privateKey?.trim();
    const walletFieldsChanged = Boolean(
      pkRaw || input.address !== undefined || input.signatureType !== undefined
    );

    if (
      input.label === undefined &&
      input.enabled === undefined &&
      !walletFieldsChanged
    ) {
      return { status: 400, body: { error: "No fields to update" } };
    }

    if (!walletFieldsChanged) {
      const next = updateAccountInNormalized(normalized, accountId, {
        label: input.label?.trim(),
        enabled: input.enabled,
      });
      writeNormalizedConfigDocument(ctx.configPath, next);
      await ctx.reloadConfig();
      syncAggregateHealth(ctx.manager.list());

      const summary = ctx.manager.buildAccountsSummary().find((a) => a.id === accountId);
      logInfo("Account updated via dashboard", { id: accountId, walletUpdated: false });

      return {
        status: 200,
        body: {
          ok: true,
          account: summary,
          message: "账户信息已更新。",
        },
      };
    }

    const walletEnv = existing.wallet_env;
    let currentWallet;
    try {
      currentWallet = loadWalletConfig(walletEnv);
    } catch {
      currentWallet = null;
    }

    const nextAddress = input.address?.trim() ?? currentWallet?.proxyAddress;
    if (!nextAddress) {
      return { status: 400, body: { error: "Wallet address missing; provide address in request" } };
    }

    const nextPrivateKey = pkRaw
      ? normalizePrivateKey(pkRaw)
      : currentWallet?.privateKey
        ? currentWallet.privateKey
        : null;

    if (!nextPrivateKey) {
      return {
        status: 400,
        body: { error: "No private key on file; provide privateKey to update wallet" },
      };
    }

    let signatureType: number;
    try {
      signatureType = resolvedSignatureTypeForWallet(
        nextPrivateKey,
        nextAddress,
        input.signatureType ?? currentWallet?.signatureType
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 400, body: { error: msg } };
    }

    if (
      nextAddress.toLowerCase() !== new Wallet(nextPrivateKey).address.toLowerCase() &&
      signatureType === 0
    ) {
      return {
        status: 400,
        body: {
          error: "Proxy address differs from EOA; set signatureType to 1 for Polymarket proxy wallet",
        },
      };
    }

    const envUpdates = walletEnvKeys(walletEnv, {
      privateKey: nextPrivateKey,
      address: nextAddress,
      signatureType: signatureType !== 0 ? signatureType : undefined,
    });
    upsertEnvFile(envUpdates);
    applyEnvToProcess(envUpdates);

    const next = updateAccountInNormalized(normalized, accountId, {
      label: input.label?.trim(),
      enabled: input.enabled,
    });
    writeNormalizedConfigDocument(ctx.configPath, next);
    await ctx.reloadConfig();
    syncAggregateHealth(ctx.manager.list());

    const summary = ctx.manager.buildAccountsSummary().find((a) => a.id === accountId);
    logInfo("Account updated via dashboard", {
      id: accountId,
      walletUpdated: Boolean(pkRaw || input.address),
      address: `${nextAddress.slice(0, 6)}…${nextAddress.slice(-4)}`,
    });

    return {
      status: 200,
      body: {
        ok: true,
        account: summary,
        message: pkRaw
          ? "账户已更新，私钥已写入 .env（不会在此显示）。"
          : "账户信息已更新。",
      },
    };
  } catch (e) {
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
}

/** Validate wallet credentials without persisting (optional pre-check). */
export function validateWalletCredentials(body: unknown): {
  ok: boolean;
  eoaAddress?: string;
  error?: string;
} {
  try {
    const input = createAccountSchema.parse(body);
    const pk = normalizePrivateKey(input.privateKey)!;
    const eoa = new Wallet(pk).address;
    return { ok: true, eoaAddress: eoa };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
