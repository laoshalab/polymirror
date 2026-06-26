import type { IncomingMessage, ServerResponse } from "node:http";
import type { AccountApiContext } from "../accounts/manager.js";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** SSE stream of new audit_log rows for the active account. */
export function handleAuditEventStream(
  req: IncomingMessage,
  res: ServerResponse,
  actx: AccountApiContext,
  searchParams: URLSearchParams
): void {
  res.writeHead(200, SSE_HEADERS);

  let lastId = parseInt(searchParams.get("lastId") ?? "0", 10);
  if (!Number.isFinite(lastId) || lastId < 0) lastId = 0;

  let closed = false;
  req.on("close", () => {
    closed = true;
    clearInterval(timer);
  });

  const push = () => {
    if (closed) return;
    try {
      const rows = actx.store.listAuditAfterId(lastId, 100);
      for (const row of rows) {
        writeSse(res, "audit", row);
        lastId = Math.max(lastId, row.id);
      }
      res.write(": keepalive\n\n");
    } catch {
      writeSse(res, "error", { message: "stream error" });
      closed = true;
      clearInterval(timer);
      res.end();
    }
  };

  writeSse(res, "ready", {
    accountId: actx.accountId,
    lastId,
    maxId: actx.store.getMaxAuditId(),
  });

  push();
  const timer = setInterval(push, 2000);
}

export function isAuditEventsPath(pathname: string): boolean {
  if (pathname === "/api/events") return true;
  return /^\/api\/accounts\/[^/]+\/events$/.test(pathname);
}

export function parseAuditEventsRoute(pathname: string): {
  accountId: string | null;
} {
  const m = pathname.match(/^\/api\/accounts\/([^/]+)\/events$/);
  if (m) return { accountId: decodeURIComponent(m[1]!) };
  return { accountId: null };
}
