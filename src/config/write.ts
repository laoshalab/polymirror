import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  appConfigSchema,
  findAccountYaml,
  leaderYamlSchema,
  legacyAppConfigSchema,
  normalizeConfigDocument,
  toLegacyDocument,
  toMultiDocument,
  type LegacyAppConfigDocument,
  type NormalizedConfigDocument,
} from "./document.js";
import { sanitizeLeaderPlaceholders } from "./load.js";

function parseDocumentFromFile(configPath: string): NormalizedConfigDocument {
  const yamlDoc = sanitizeLeaderPlaceholders(parseYaml(readFileSync(configPath, "utf8")));
  return normalizeConfigDocument(yamlDoc);
}

export function readConfigDocument(configPath: string): LegacyAppConfigDocument {
  return toLegacyDocument(readNormalizedConfigDocument(configPath));
}

export function readNormalizedConfigDocument(configPath: string): NormalizedConfigDocument {
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  try {
    return parseDocumentFromFile(configPath);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("; ");
      throw new Error(`config.yaml invalid: ${msg}`);
    }
    throw e;
  }
}

export function writeNormalizedConfigDocument(
  configPath: string,
  normalized: NormalizedConfigDocument
): void {
  const onDisk = existsSync(configPath)
    ? normalizeConfigDocument(sanitizeLeaderPlaceholders(parseYaml(readFileSync(configPath, "utf8"))))
    : normalized;

  let payload: unknown;
  if (onDisk.format === "legacy" && normalized.accounts.length === 1) {
    payload = toLegacyDocument(normalized);
    legacyAppConfigSchema.parse(payload);
  } else {
    payload = toMultiDocument(normalized);
  }

  if (existsSync(configPath)) {
    copyFileSync(configPath, `${configPath}.bak`);
  }
  writeFileSync(configPath, stringifyYaml(payload, { lineWidth: 0 }), "utf8");
}

export function writeConfigDocument(configPath: string, doc: LegacyAppConfigDocument): void {
  const validated = appConfigSchema.parse(doc);
  if (existsSync(configPath)) {
    copyFileSync(configPath, `${configPath}.bak`);
  }
  writeFileSync(configPath, stringifyYaml(validated, { lineWidth: 0 }), "utf8");
}

const leaderElement = leaderYamlSchema;

export function upsertLeaderInDocument(
  doc: LegacyAppConfigDocument,
  leaderRow: Record<string, unknown>,
  replaceId?: string
): LegacyAppConfigDocument {
  const id = String(leaderRow.id);
  const parsedLeader = leaderElement.parse(leaderRow);
  const leaders = [...doc.leaders];
  const idx = leaders.findIndex((l) => l.id === id);

  if (idx >= 0) {
    if (replaceId && replaceId !== id) {
      throw new Error(`Leader id already exists: ${id}`);
    }
    leaders[idx] = parsedLeader;
  } else {
    if (leaders.some((l) => l.id === id)) {
      throw new Error(`Leader id already exists: ${id}`);
    }
    leaders.push(parsedLeader);
  }

  return appConfigSchema.parse({ ...doc, leaders });
}

export function upsertLeaderInAccount(
  normalized: NormalizedConfigDocument,
  accountId: string,
  leaderRow: Record<string, unknown>,
  replaceId?: string
): NormalizedConfigDocument {
  const account = findAccountYaml(normalized, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  const id = String(leaderRow.id);
  const parsedLeader = leaderElement.parse(leaderRow);
  const leaders = [...account.leaders];
  const idx = leaders.findIndex((l) => l.id === id);

  if (idx >= 0) {
    if (replaceId && replaceId !== id) {
      throw new Error(`Leader id already exists: ${id}`);
    }
    leaders[idx] = parsedLeader;
  } else {
    leaders.push(parsedLeader);
  }

  const accounts = normalized.accounts.map((a) =>
    a.id === accountId ? { ...a, leaders } : a
  );
  return normalizeConfigDocument(
    normalized.format === "legacy"
      ? { global: normalized.defaultsGlobal, leaders: accounts[0]!.leaders }
      : { defaults: { global: normalized.defaultsGlobal }, accounts }
  );
}

export function patchLeaderInDocument(
  doc: LegacyAppConfigDocument,
  leaderId: string,
  mergedRow: Record<string, unknown>
): LegacyAppConfigDocument {
  const idx = doc.leaders.findIndex((l) => l.id === leaderId);
  if (idx < 0) throw new Error(`Leader not found: ${leaderId}`);

  const parsedLeader = leaderElement.parse(mergedRow);
  const leaders = [...doc.leaders];
  leaders[idx] = parsedLeader;
  return appConfigSchema.parse({ ...doc, leaders });
}

export function removeLeaderFromAccount(
  normalized: NormalizedConfigDocument,
  accountId: string,
  leaderId: string
): NormalizedConfigDocument {
  const account = findAccountYaml(normalized, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  if (!account.leaders.some((l) => l.id === leaderId)) {
    throw new Error(`Leader not found: ${leaderId}`);
  }

  const leaders = account.leaders.filter((l) => l.id !== leaderId);
  const accounts = normalized.accounts.map((a) =>
    a.id === accountId ? { ...a, leaders } : a
  );
  return normalizeConfigDocument(
    normalized.format === "legacy"
      ? { global: normalized.defaultsGlobal, leaders: accounts[0]!.leaders }
      : { defaults: { global: normalized.defaultsGlobal }, accounts }
  );
}

export function patchLeaderInAccount(
  normalized: NormalizedConfigDocument,
  accountId: string,
  leaderId: string,
  mergedRow: Record<string, unknown>
): NormalizedConfigDocument {
  const account = findAccountYaml(normalized, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  const idx = account.leaders.findIndex((l) => l.id === leaderId);
  if (idx < 0) throw new Error(`Leader not found: ${leaderId}`);

  const parsedLeader = leaderElement.parse(mergedRow);
  const leaders = [...account.leaders];
  leaders[idx] = parsedLeader;

  const accounts = normalized.accounts.map((a) =>
    a.id === accountId ? { ...a, leaders } : a
  );
  return normalizeConfigDocument(
    normalized.format === "legacy"
      ? { global: normalized.defaultsGlobal, leaders: accounts[0]!.leaders }
      : { defaults: { global: normalized.defaultsGlobal }, accounts }
  );
}

export function documentLeaderToRecord(
  leader: LegacyAppConfigDocument["leaders"][number]
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(leader)) as Record<string, unknown>;
}

export { type NormalizedConfigDocument };
