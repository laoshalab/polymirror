import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** .env holds private keys — keep it readable/writable by the owner only. */
const ENV_FILE_MODE = 0o600;

/** Best-effort chmod 0600 (no-op / limited on platforms without POSIX perms). */
function enforceOwnerOnlyPermissions(path: string): void {
  try {
    chmodSync(path, ENV_FILE_MODE);
  } catch {
    /* chmod unsupported (e.g. Windows) — ignore */
  }
}

export function walletEnvSuffix(accountId: string): string {
  if (accountId.trim().toLowerCase() === "default") return "";
  return accountId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
}

export function envKey(base: string, walletEnv: string): string {
  const suffix = walletEnv.trim().toUpperCase();
  if (!suffix) return base;
  return `${base}_${suffix}`;
}

export function defaultEnvPath(): string {
  return resolve(process.cwd(), ".env");
}

/** Upsert keys in .env; values must not contain newlines. Never log return value. */
export function upsertEnvFile(
  updates: Record<string, string>,
  envPath = defaultEnvPath()
): void {
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const updated = new Set<string>();
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = line.indexOf("=");
    if (eq <= 0) return line;
    const key = line.slice(0, eq).trim();
    if (!(key in updates)) return line;
    updated.add(key);
    return `${key}=${updates[key]!}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!updated.has(key)) {
      out.push(`${key}=${value}`);
    }
  }
  while (out.length > 0 && out[out.length - 1] === "") {
    out.pop();
  }
  if (existsSync(envPath)) {
    const backupPath = `${envPath}.bak`;
    copyFileSync(envPath, backupPath);
    enforceOwnerOnlyPermissions(backupPath);
  }
  // mode applies only when creating a new file; chmod afterwards covers
  // pre-existing files that may have been created with looser permissions.
  writeFileSync(envPath, `${out.join("\n")}\n`, { encoding: "utf8", mode: ENV_FILE_MODE });
  enforceOwnerOnlyPermissions(envPath);
}

export function applyEnvToProcess(updates: Record<string, string>): void {
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

export function walletEnvKeys(
  walletEnv: string,
  creds: { privateKey: string; address: string; signatureType?: number }
): Record<string, string> {
  const keys: Record<string, string> = {
    [envKey("POLYMARKET_PRIVATE_KEY", walletEnv)]: creds.privateKey,
    [envKey("POLYMARKET_ADDRESS", walletEnv)]: creds.address,
  };
  if (creds.signatureType !== undefined && creds.signatureType !== 0) {
    keys[envKey("POLYMARKET_SIGNATURE_TYPE", walletEnv)] = String(creds.signatureType);
  }
  return keys;
}
