import { useCallback, useEffect, useRef, useState } from "react";
import { accountApi, getToken, type AuditRow } from "../api/client";

interface UseAuditStreamOptions {
  enabled?: boolean;
  onAudit?: (row: AuditRow) => void;
}

function parseSseChunk(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const block of parts) {
    if (!block.trim() || block.startsWith(":")) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) events.push({ event, data: dataLines.join("\n") });
  }

  return { events, rest };
}

export function useAuditStream({ enabled = true, onAudit }: UseAuditStreamOptions = {}) {
  const [connected, setConnected] = useState(false);
  const lastIdRef = useRef(0);
  const onAuditRef = useRef(onAudit);
  onAuditRef.current = onAudit;

  const reset = useCallback(() => {
    lastIdRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const ac = new AbortController();
    let retryMs = 2000;

    async function connect() {
      while (!ac.signal.aborted) {
        try {
          const url = accountApi(`/api/events?lastId=${lastIdRef.current}`);
          const token = getToken();
          const res = await fetch(url, {
            headers: {
              Accept: "text/event-stream",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: ac.signal,
          });

          if (res.status === 401) {
            setConnected(false);
            return;
          }
          if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);

          setConnected(true);
          retryMs = 2000;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!ac.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseChunk(buffer);
            buffer = parsed.rest;

            for (const ev of parsed.events) {
              if (ev.event === "ready") {
                try {
                  const payload = JSON.parse(ev.data) as { lastId?: number; maxId?: number };
                  if (payload.lastId != null) lastIdRef.current = payload.lastId;
                } catch {
                  /* ignore */
                }
              } else if (ev.event === "audit") {
                try {
                  const row = JSON.parse(ev.data) as AuditRow;
                  lastIdRef.current = Math.max(lastIdRef.current, row.id);
                  onAuditRef.current?.(row);
                } catch {
                  /* ignore */
                }
              }
            }
          }

          setConnected(false);
        } catch (e) {
          if (ac.signal.aborted) return;
          setConnected(false);
          await new Promise((r) => setTimeout(r, retryMs));
          retryMs = Math.min(retryMs * 1.5, 15000);
        }
      }
    }

    void connect();
    return () => {
      ac.abort();
      setConnected(false);
    };
  }, [enabled]);

  return { connected, reset };
}
