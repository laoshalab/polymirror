import { fetchWithTimeout } from "../util/fetch.js";
import type { LeaderConfig } from "../config/types.js";

const GAMMA_PROFILE = "https://gamma-api.polymarket.com/public-profile";

interface GammaProfile {
  proxyWallet?: string;
  address?: string;
}

export async function resolveUsernameToAddress(username: string): Promise<string> {
  const clean = username.replace(/^@/, "").trim();
  if (!clean) {
    throw new Error("Leader username is empty");
  }

  const url = `${GAMMA_PROFILE}?username=${encodeURIComponent(clean)}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Gamma profile lookup failed (${res.status}) for @${clean}`);
  }

  const data = (await res.json()) as GammaProfile;
  const address = (data.proxyWallet ?? data.address ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`No proxy wallet found for username @${clean}`);
  }
  return address;
}

export async function resolveLeaderAddresses(leaders: LeaderConfig[]): Promise<LeaderConfig[]> {
  const resolved: LeaderConfig[] = [];

  for (const leader of leaders) {
    if (!leader.enabled) {
      resolved.push(leader);
      continue;
    }
    if (leader.address) {
      resolved.push(leader);
      continue;
    }
    if (!leader.username) {
      throw new Error(`Leader ${leader.id}: address or username required`);
    }
    const address = await resolveUsernameToAddress(leader.username);
    resolved.push({ ...leader, address });
  }

  return resolved;
}
