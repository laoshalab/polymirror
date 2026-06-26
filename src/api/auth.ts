import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export interface DashboardAuthConfig {
  enabled: boolean;
  token?: string;
}

export function isLocalBindAddress(bind: string): boolean {
  const b = bind.trim().toLowerCase();
  return b === "127.0.0.1" || b === "localhost" || b === "::1" || b === "[::1]";
}

export function resolveApiBind(): string {
  return (process.env.HEALTH_BIND ?? process.env.DASHBOARD_BIND ?? "127.0.0.1").trim() || "127.0.0.1";
}

export function loadDashboardAuth(): DashboardAuthConfig {
  const token = process.env.DASHBOARD_TOKEN?.trim();
  const explicit = (process.env.DASHBOARD_ENABLED ?? "true").toLowerCase();
  if (explicit === "false") {
    return { enabled: false };
  }
  if (!token) {
    return { enabled: false };
  }
  return { enabled: true, token };
}

/** Refuse to expose API on non-localhost without DASHBOARD_TOKEN. */
export function assertDashboardAuthForBind(bind?: string): void {
  const resolved = bind ?? resolveApiBind();
  if (isLocalBindAddress(resolved)) return;

  const auth = loadDashboardAuth();
  if (!auth.enabled) {
    throw new Error(
      `HEALTH_BIND=${resolved} requires DASHBOARD_TOKEN in .env (API would be open to the network otherwise). ` +
        `Set DASHBOARD_TOKEN or bind to 127.0.0.1.`
    );
  }
}

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAuthorized(req: IncomingMessage, auth: DashboardAuthConfig): boolean {
  if (!auth.enabled) return true;

  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) {
    return tokensEqual(header.slice(7).trim(), auth.token!);
  }

  return false;
}

export function authRequiredResponse(): { status: number; body: object } {
  return {
    status: 401,
    body: { error: "Unauthorized", hint: "Set Authorization: Bearer <DASHBOARD_TOKEN>" },
  };
}

function isLoopbackHostname(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    h === "localhost" ||
    h === "::1" ||
    h === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

/** Extract the lowercased hostname from a Host header or full Origin URL. */
function hostnameOf(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const url = v.includes("://") ? new URL(v) : new URL(`http://${v}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * CSRF / DNS-rebinding guard for the token-less local API.
 *
 * When a DASHBOARD_TOKEN is configured the Bearer token already defeats CSRF
 * (browsers never auto-attach Authorization headers), so we skip these checks
 * to avoid breaking reverse-proxy / custom-domain deployments.
 *
 * Without a token the server only ever binds loopback (enforced by
 * assertDashboardAuthForBind), so we require state-changing requests to target
 * a loopback Host and, when present, originate from a loopback Origin. This
 * blocks a malicious web page (and DNS-rebinding) from driving the API.
 */
export function isWriteRequestAllowed(req: IncomingMessage, auth: DashboardAuthConfig): boolean {
  if (auth.enabled) return true;

  const host = hostnameOf(req.headers.host ?? "");
  if (host && !isLoopbackHostname(host)) return false;

  const originHeader = req.headers.origin;
  if (originHeader && originHeader !== "null") {
    const originHost = hostnameOf(originHeader);
    if (!originHost || !isLoopbackHostname(originHost)) return false;
  }

  return true;
}

export function crossOriginForbiddenResponse(): { status: number; body: object } {
  return {
    status: 403,
    body: {
      error: "Cross-origin write forbidden",
      hint: "Set DASHBOARD_TOKEN to call the API from another origin (Authorization: Bearer <token>).",
    },
  };
}
