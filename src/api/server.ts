import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiContext } from "./routes.js";
import { handleApiRequest } from "./routes.js";
import { readJsonBody } from "./body.js";
import {
  authRequiredResponse,
  crossOriginForbiddenResponse,
  isAuthorized,
  isWriteRequestAllowed,
  loadDashboardAuth,
  resolveApiBind,
} from "./auth.js";
import {
  handleAuditEventStream,
  isAuditEventsPath,
  parseAuditEventsRoute,
} from "./events.js";
import { healthSnapshot } from "../notify/health.js";
import { logInfo, logError } from "../notify/logger.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function resolveBind(): string {
  return resolveApiBind();
}

function dashboardRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "dist", "dashboard"),
    join(fileURLToPath(new URL(".", import.meta.url)), "..", "dashboard"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return candidates[0]!;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage): { pathname: string; searchParams: URLSearchParams } {
  const url = new URL(req.url ?? "/", "http://localhost");
  return { pathname: url.pathname, searchParams: url.searchParams };
}

function serveStatic(pathname: string, res: ServerResponse): boolean {
  const root = dashboardRoot();
  const indexPath = join(root, "index.html");
  if (!existsSync(indexPath)) {
    return false;
  }

  let filePath = join(root, pathname === "/" ? "index.html" : pathname);
  // Require an exact match or a real path-separator boundary so a sibling
  // directory sharing the prefix (e.g. ".../dashboard-bak") cannot escape root.
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    sendJson(res, 403, { error: "Forbidden" });
    return true;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = indexPath;
  }

  try {
    const ext = extname(filePath);
    const type = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(readFileSync(filePath));
  } catch {
    return false;
  }
  return true;
}

function handleHealth(res: ServerResponse): void {
  const ok = !healthSnapshot.killSwitchActive;
  sendJson(res, ok ? 200 : 503, {
    status: ok ? "ok" : "degraded",
    uptimeSec: Math.floor((Date.now() - healthSnapshot.startedAt) / 1000),
    previewMode: healthSnapshot.previewMode,
    killSwitchActive: healthSnapshot.killSwitchActive,
    lastPollAt: healthSnapshot.lastPollAt,
    lastPoll: healthSnapshot.lastPollResult,
    enabledLeaders: healthSnapshot.enabledLeaders,
    lastError: healthSnapshot.lastError,
    pendingOrders: healthSnapshot.pendingOrders,
    walletDrifts: healthSnapshot.walletDrifts,
  });
}

async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  auth: ReturnType<typeof loadDashboardAuth>
): Promise<void> {
  const method = req.method ?? "GET";
  const { pathname, searchParams } = parseUrl(req);

  if (pathname !== "/api/auth/config" && !isAuthorized(req, auth)) {
    const denied = authRequiredResponse();
    sendJson(res, denied.status, denied.body);
    return;
  }

  if (WRITE_METHODS.has(method) && !isWriteRequestAllowed(req, auth)) {
    const denied = crossOriginForbiddenResponse();
    sendJson(res, denied.status, denied.body);
    return;
  }

  if (method === "GET" && isAuditEventsPath(pathname)) {
    const { accountId } = parseAuditEventsRoute(pathname);
    let actx;
    try {
      actx = ctx.manager.toApiContext(accountId ?? searchParams.get("accountId"));
    } catch (e) {
      sendJson(res, 404, { error: e instanceof Error ? e.message : String(e) });
      return;
    }
    handleAuditEventStream(req, res, actx, searchParams);
    return;
  }

  let body: unknown;
  if (WRITE_METHODS.has(method)) {
    try {
      body = await readJsonBody(req);
    } catch (e) {
      sendJson(res, 400, { error: e instanceof Error ? e.message : "Bad JSON body" });
      return;
    }
  }

  try {
    const result = await handleApiRequest(ctx, method, pathname, searchParams, body);
    if (result) {
      sendJson(res, result.status, result.body);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    logError("API handler error", { path: pathname, error: e instanceof Error ? e.message : String(e) });
    sendJson(res, 500, { error: "Internal server error" });
  }
}

export function startApiServer(port: number, ctx: ApiContext): Server | null {
  if (port <= 0) return null;

  const auth = loadDashboardAuth();
  const dashPath = dashboardRoot();
  const hasDashboard = existsSync(join(dashPath, "index.html"));

  const server = createServer((req, res) => {
    const method = req.method ?? "GET";
    const { pathname } = parseUrl(req);

    if (pathname === "/health" || pathname === "/healthz") {
      handleHealth(res);
      return;
    }

    if (pathname.startsWith("/api/")) {
      void handleApiRoute(req, res, ctx, auth);
      return;
    }

    if (method === "GET" && hasDashboard) {
      if (serveStatic(pathname, res)) return;
    }

    sendJson(res, 404, {
      error: "Not found",
      hint: hasDashboard ? undefined : "Build dashboard: npm run build:dashboard",
    });
  });

  server.listen(port, resolveBind(), () => {
    logInfo("API server listening", {
      port,
      bind: resolveBind(),
      dashboard: hasDashboard,
      auth: auth.enabled,
      paths: ["/health", "/api/*", hasDashboard ? "/" : "(no static UI)"],
    });
  });

  server.on("error", (e) => {
    logError("API server error", { error: e.message });
  });

  return server;
}

export interface ApiServerState {
  server: Server | null;
  port: number;
}

/** Start, stop, or restart the API server when health_port changes (hot-reload). */
export function syncApiServer(
  state: ApiServerState,
  port: number,
  ctx: ApiContext
): Server | null {
  if (port <= 0) {
    if (state.server) {
      state.server.close();
      state.server = null;
      logInfo("API server stopped", { reason: "health_port disabled" });
    }
    state.port = 0;
    return null;
  }

  if (state.server && state.port === port) {
    return state.server;
  }

  if (state.server) {
    state.server.close();
    state.server = null;
    logInfo("API server restarting", { fromPort: state.port, toPort: port });
  }

  state.port = port;
  state.server = startApiServer(port, ctx);
  return state.server;
}
