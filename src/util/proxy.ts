export type ProxyMode = "none" | "static" | "dynamic";

export interface ProxyConfig {
  mode: ProxyMode;
  staticUrl?: string;
  dynamicUrl?: string;
  /** Append random session id to dynamic URL for IP rotation (common with residential proxies). */
  dynamicRotateSession?: boolean;
}

type UndiciDispatcher = NonNullable<RequestInit & { dispatcher?: unknown }>["dispatcher"];

let activeConfig: ProxyConfig = { mode: "none" };
let activeSource: "yaml" | "env" | "none" = "none";
let staticDispatcher: UndiciDispatcher | undefined;
let undiciGlobalProxyUrl: string | undefined;

/** Route Node global fetch (@polymarket/client) through the configured proxy. */
export async function ensureUndiciGlobalProxy(): Promise<void> {
  const url = getEffectiveProxyUrl(false);
  if (!url) return;
  process.env.HTTPS_PROXY ??= url;
  process.env.HTTP_PROXY ??= url;
  if (url === undiciGlobalProxyUrl) return;
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(url));
    undiciGlobalProxyUrl = url;
  } catch {
    console.warn("Warning: proxy URL set but undici ProxyAgent unavailable for global fetch");
  }
}

const PROXY_URL_RE = /^(https?|socks5?):\/\/.+/i;

export function isValidProxyUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return PROXY_URL_RE.test(trimmed) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function maskProxyUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.password) parsed.password = "****";
    if (parsed.username) parsed.username = parsed.username.slice(0, 2) + "****";
    return parsed.toString();
  } catch {
    return trimmed.replace(/:[^:@/]+@/, ":****@");
  }
}

function envProxyUrl(): string {
  return (process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? "").trim();
}

export function resolveProxyConfig(yaml?: Partial<ProxyConfig> | null): {
  config: ProxyConfig;
  source: "yaml" | "env" | "none";
} {
  const mode = yaml?.mode ?? "none";
  if (mode === "static") {
    const staticUrl = (yaml?.staticUrl ?? "").trim();
    if (staticUrl && isValidProxyUrl(staticUrl)) {
      return { config: { mode: "static", staticUrl }, source: "yaml" };
    }
    if (staticUrl) {
      console.warn("Warning: proxy.mode=static but static_url invalid — proxy disabled");
    }
    return { config: { mode: "none" }, source: "none" };
  }
  if (mode === "dynamic") {
    const dynamicUrl = (yaml?.dynamicUrl ?? "").trim();
    if (dynamicUrl && isValidProxyUrl(dynamicUrl)) {
      return {
        config: {
          mode: "dynamic",
          dynamicUrl,
          dynamicRotateSession: yaml?.dynamicRotateSession ?? true,
        },
        source: "yaml",
      };
    }
    if (dynamicUrl) {
      console.warn("Warning: proxy.mode=dynamic but dynamic_url invalid — proxy disabled");
    }
    return { config: { mode: "none" }, source: "none" };
  }

  const envUrl = envProxyUrl();
  if (envUrl && isValidProxyUrl(envUrl)) {
    return { config: { mode: "static", staticUrl: envUrl }, source: "env" };
  }
  return { config: { mode: "none" }, source: "none" };
}

export function setProxyConfig(config: ProxyConfig, source: "yaml" | "env" | "none" = "none"): void {
  activeConfig = config;
  activeSource = source;
  staticDispatcher = undefined;
  undiciGlobalProxyUrl = undefined;
  void ensureUndiciGlobalProxy();
}

export function getProxyConfig(): ProxyConfig {
  return activeConfig;
}

export function isProxyConfigured(): boolean {
  return activeConfig.mode !== "none";
}

export function getProxySource(): "yaml" | "env" | "none" {
  return activeSource;
}

export function getEffectiveProxyUrl(forRequest = false): string | undefined {
  if (activeConfig.mode === "static") {
    return activeConfig.staticUrl?.trim() || undefined;
  }
  if (activeConfig.mode === "dynamic") {
    const base = activeConfig.dynamicUrl?.trim();
    if (!base) return undefined;
    if (!forRequest || !activeConfig.dynamicRotateSession) return base;
    const session = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const parsed = new URL(base);
      parsed.searchParams.set("session", session);
      return parsed.toString();
    } catch {
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}session=${session}`;
    }
  }
  return undefined;
}

export function getProxyHint(): string {
  if (isProxyConfigured()) return "";
  return " (若在中国大陆，请在设置页配置代理或 .env 设置 HTTPS_PROXY)";
}

async function createDispatcher(url: string): Promise<UndiciDispatcher | undefined> {
  try {
    const { ProxyAgent } = await import("undici");
    return new ProxyAgent(url);
  } catch {
    console.warn("Warning: proxy URL set but undici ProxyAgent unavailable — proxy ignored");
    return undefined;
  }
}

export async function getFetchDispatcher(): Promise<UndiciDispatcher | undefined> {
  if (activeConfig.mode === "none") return undefined;

  if (activeConfig.mode === "static") {
    if (staticDispatcher) return staticDispatcher;
    const url = getEffectiveProxyUrl(false);
    if (!url) return undefined;
    staticDispatcher = await createDispatcher(url);
    return staticDispatcher;
  }

  const url = getEffectiveProxyUrl(true);
  if (!url) return undefined;
  return createDispatcher(url);
}

export function proxyConfigFromYaml(raw: unknown): ProxyConfig {
  if (!raw || typeof raw !== "object") return { mode: "none" };
  const p = raw as Record<string, unknown>;
  const modeRaw = String(p.mode ?? "none").toLowerCase();
  const mode: ProxyMode =
    modeRaw === "static" || modeRaw === "fixed"
      ? "static"
      : modeRaw === "dynamic"
        ? "dynamic"
        : "none";
  return resolveProxyConfig({
    mode,
    staticUrl: typeof p.static_url === "string" ? p.static_url : undefined,
    dynamicUrl: typeof p.dynamic_url === "string" ? p.dynamic_url : undefined,
    dynamicRotateSession:
      p.dynamic_rotate_session === undefined ? true : Boolean(p.dynamic_rotate_session),
  }).config;
}

export function applyProxyFromYaml(raw: unknown): ProxyConfig {
  if (!raw || typeof raw !== "object") {
    const resolved = resolveProxyConfig({ mode: "none" });
    setProxyConfig(resolved.config, resolved.source);
    return resolved.config;
  }
  const p = raw as Record<string, unknown>;
  const modeRaw = String(p.mode ?? "none").toLowerCase();
  const mode: ProxyMode =
    modeRaw === "static" || modeRaw === "fixed"
      ? "static"
      : modeRaw === "dynamic"
        ? "dynamic"
        : "none";
  const resolved = resolveProxyConfig({
    mode,
    staticUrl: typeof p.static_url === "string" ? p.static_url : undefined,
    dynamicUrl: typeof p.dynamic_url === "string" ? p.dynamic_url : undefined,
    dynamicRotateSession:
      p.dynamic_rotate_session === undefined ? true : Boolean(p.dynamic_rotate_session),
  });
  setProxyConfig(resolved.config, resolved.source);
  return resolved.config;
}

export function proxyConfigToYaml(config: ProxyConfig): Record<string, unknown> {
  return {
    mode: config.mode,
    static_url: config.staticUrl ?? "",
    dynamic_url: config.dynamicUrl ?? "",
    dynamic_rotate_session: config.dynamicRotateSession ?? true,
  };
}
