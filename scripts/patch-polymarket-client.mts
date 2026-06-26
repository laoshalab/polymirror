/**
 * Patches @polymarket/client for PolyMirror deposit-wallet + env CLOB credentials.
 *
 * 1. classifyWalletType — relayer-deployed wallets via globalThis.__POLYMIRROR_RELAYER_WALLETS__
 * 2. beginAuthentication — trust .env credentials when L2 fetchApiKeys succeeds (skip includes check)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chunkPath = join(root, "node_modules/@polymarket/client/dist/chunk-UBQO5URS.js");
const indexPath = join(root, "node_modules/@polymarket/client/dist/index.js");

const RELAYER_MARKER = "__POLYMIRROR_RELAYER_WALLETS__";
const CLASSIFY_NEEDLE =
  "if(isSameEvmAddress(t,wn(r,o)))return WalletType.POLY_PROXY;never(";
const CLASSIFY_REPLACEMENT =
  `if(isSameEvmAddress(t,wn(r,o)))return WalletType.POLY_PROXY;if(globalThis.${RELAYER_MARKER}?.has?.(t.toLowerCase()))return WalletType.DEPOSIT_WALLET;never(`;

const CREDENTIALS_NEEDLE =
  "try{if((await L(Ae)).includes(n.credentials.key))return Ae}catch(O){if(!(O instanceof d$1)||O.status!==401)throw O}";
const CREDENTIALS_REPLACEMENT =
  "try{await L(Ae);return Ae}catch(O){if(!(O instanceof d$1)||O.status!==401)throw O}";
const CREDENTIALS_MARKER = "POLYMIRROR_TRUST_ENV_CREDENTIALS";

/**
 * Explicit, documented escape hatch. When the SDK version legitimately changes
 * and the needles need updating, an operator can set this to unblock installs —
 * but the default is to FAIL LOUDLY so drift is never silently ignored.
 */
const ALLOW_UNPATCHED = process.env.POLYMIRROR_ALLOW_UNPATCHED_SDK === "1";

class SdkPatchError extends Error {}

function patchOnce(
  path: string,
  label: string,
  needle: string,
  replacement: string,
  appliedMarker: string
): boolean {
  if (!existsSync(path)) {
    throw new SdkPatchError(
      `${label} not found at ${path} — @polymarket/client is a required dependency. ` +
        `Run "npm install" to install it before patching.`
    );
  }
  const src = readFileSync(path, "utf8");
  if (src.includes(appliedMarker) || src.includes(replacement)) {
    // Already patched (idempotent) — checked before the needle so re-running on
    // a working tree never fails.
    return false;
  }
  if (!src.includes(needle)) {
    throw new SdkPatchError(
      `${label}: patch target not found — @polymarket/client likely changed version. ` +
        `Update the needle in scripts/patch-polymarket-client.mts to match the new SDK build, ` +
        `then verify the change is still correct. ` +
        `To bypass intentionally (NOT recommended), set POLYMIRROR_ALLOW_UNPATCHED_SDK=1.`
    );
  }
  writeFileSync(path, src.replace(needle, replacement), "utf8");
  console.log(`patch-polymarket-client: applied ${appliedMarker} in ${label}`);
  return true;
}

function main(): void {
  try {
    patchOnce(
      chunkPath,
      "chunk",
      CLASSIFY_NEEDLE,
      CLASSIFY_REPLACEMENT,
      RELAYER_MARKER
    );
    patchOnce(
      indexPath,
      "index.js",
      CREDENTIALS_NEEDLE,
      CREDENTIALS_REPLACEMENT,
      CREDENTIALS_MARKER
    );
  } catch (e) {
    if (e instanceof SdkPatchError) {
      const msg = `patch-polymarket-client: ${e.message}`;
      if (ALLOW_UNPATCHED) {
        console.warn(`${msg}\n(continuing because POLYMIRROR_ALLOW_UNPATCHED_SDK=1)`);
        return;
      }
      console.error(msg);
      process.exit(1);
    }
    throw e;
  }
}

main();
