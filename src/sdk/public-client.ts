import { createPublicClient, type PublicClient } from "@polymarket/client";
import { ensureUndiciGlobalProxy } from "../util/proxy.js";

let client: PublicClient | null = null;

/** Shared unauthenticated Polymarket SDK client (markets, activity, order books). */
export async function getPublicClient(): Promise<PublicClient> {
  await ensureUndiciGlobalProxy();
  client ??= createPublicClient();
  return client;
}

export function resetPublicClientCache(): void {
  client = null;
}
