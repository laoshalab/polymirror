import { ensureUndiciGlobalProxy } from "../util/proxy.js";
import { fetchWithTimeout } from "../util/fetch.js";

const RELAYER_BASE = "https://relayer-v2.polymarket.com";

declare global {
  // eslint-disable-next-line no-var
  var __POLYMIRROR_RELAYER_WALLETS__: Set<string> | undefined;
}

const deployedCache = new Map<string, boolean>();

/** Register wallet so patched @polymarket/client classifyWalletType accepts relayer-deployed addresses. */
export function registerRelayerDeployedWallet(address: string): void {
  globalThis.__POLYMIRROR_RELAYER_WALLETS__ ??= new Set<string>();
  globalThis.__POLYMIRROR_RELAYER_WALLETS__.add(address.toLowerCase());
}

export async function fetchRelayerWalletDeployed(address: string): Promise<boolean> {
  const key = address.toLowerCase();
  if (deployedCache.has(key)) return deployedCache.get(key)!;

  await ensureUndiciGlobalProxy();
  const url = `${RELAYER_BASE}/deployed?address=${encodeURIComponent(address)}&type=WALLET`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      deployedCache.set(key, false);
      return false;
    }
    const body = (await res.json()) as { deployed?: boolean };
    const deployed = body.deployed === true;
    deployedCache.set(key, deployed);
    if (deployed) registerRelayerDeployedWallet(address);
    return deployed;
  } catch {
    deployedCache.set(key, false);
    return false;
  }
}

export function clearRelayerWalletCache(): void {
  deployedCache.clear();
  globalThis.__POLYMIRROR_RELAYER_WALLETS__?.clear();
}
