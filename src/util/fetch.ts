import { getFetchDispatcher, getProxyHint, isProxyConfigured } from "./proxy.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchWithTimeoutInit extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  init: FetchWithTimeoutInit = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const dispatcher = await getFetchDispatcher();
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    if (e instanceof Error && e.message === "fetch failed") {
      throw new Error(`无法连接 ${new URL(url).host}${getProxyHint()}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: FetchWithTimeoutInit = {},
  retries = 0
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${await res.text()}`);
        (err as Error & { httpStatus?: number }).httpStatus = res.status;
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const status = (lastError as Error & { httpStatus?: number }).httpStatus;
      if (status !== undefined && status >= 400 && status < 500) {
        break;
      }
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`fetch failed: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { isProxyConfigured, getProxyHint };
