import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { StateStore } from "../src/state/store.js";
import { syncApiServer, type ApiServerState } from "../src/api/server.js";
import { previewRuntimeConfig } from "./helpers/fixtures.js";
import type { ApiContext } from "../src/api/routes.js";
import type { AccountManager } from "../src/accounts/manager.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForListen(server: Server): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.json() };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function buildApiContext(dir: string, store: StateStore): ApiContext {
  const config = previewRuntimeConfig();
  const manager = {
    defaultAccountId: "main",
    toApiContext: () => ({
      accountId: "main",
      label: "Main",
      enabled: true,
      getConfig: () => config,
      store,
      dbPath: join(dir, "test.db"),
      configPath: join(dir, "config.yaml"),
      reloadConfig: async () => {},
    }),
    require: () => ({
      health: { walletDrifts: [], lastError: null },
    }),
    buildAccountsSummary: () => [],
    list: () => [],
  } as unknown as AccountManager;

  return {
    manager,
    configPath: join(dir, "config.yaml"),
    configFileKey: "config.yaml",
    reloadConfig: async () => {},
  };
}

describe("syncApiServer", () => {
  let dir: string;
  let store: StateStore;
  let apiState: ApiServerState;
  let ctx: ApiContext;
  let portA = 0;
  let portB = 0;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-api-server-"));
    store = new StateStore(join(dir, "test.db"));
    apiState = { server: null, port: 0 };
    portA = await freePort();
    portB = await freePort();
    while (portB === portA) {
      portB = await freePort();
    }
    ctx = buildApiContext(dir, store);
  });

  afterEach(async () => {
    if (apiState.server) {
      await closeServer(apiState.server);
      apiState.server = null;
    }
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves /health on the configured port", async () => {
    const server = syncApiServer(apiState, portA, ctx);
    expect(server).not.toBeNull();
    await waitForListen(server!);

    const res = await fetchJson(`http://127.0.0.1:${portA}/health`);
    expect(res.status).toBe(200);
    expect((res.body as { status?: string }).status).toBe("ok");
  });

  it("restarts when health_port changes", async () => {
    syncApiServer(apiState, portA, ctx);
    await waitForListen(apiState.server!);

    syncApiServer(apiState, portB, ctx);
    await waitForListen(apiState.server!);

    const oldPort = await fetch(`http://127.0.0.1:${portA}/health`).catch(() => null);
    expect(oldPort).toBeNull();

    const res = await fetchJson(`http://127.0.0.1:${portB}/health`);
    expect(res.status).toBe(200);
    expect(apiState.port).toBe(portB);
  });

  it("stops server when port is set to 0", async () => {
    syncApiServer(apiState, portA, ctx);
    await waitForListen(apiState.server!);

    syncApiServer(apiState, 0, ctx);
    expect(apiState.server).toBeNull();

    const res = await fetch(`http://127.0.0.1:${portA}/health`).catch(() => null);
    expect(res).toBeNull();
  });
});

describe("API auth", () => {
  let dir: string;
  let store: StateStore;
  let apiState: ApiServerState;
  let ctx: ApiContext;
  let port = 0;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-api-auth-"));
    store = new StateStore(join(dir, "test.db"));
    apiState = { server: null, port: 0 };
    port = await freePort();
    ctx = buildApiContext(dir, store);
  });

  afterEach(async () => {
    if (apiState.server) {
      await closeServer(apiState.server);
    }
    store.close();
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("exposes /api/auth/config without token", async () => {
    vi.stubEnv("DASHBOARD_TOKEN", "");
    syncApiServer(apiState, port, ctx);
    await waitForListen(apiState.server!);

    const res = await fetchJson(`http://127.0.0.1:${port}/api/auth/config`);
    expect(res.status).toBe(200);
    expect((res.body as { authRequired?: boolean }).authRequired).toBe(false);
  });

  it("requires Bearer token for protected routes when DASHBOARD_TOKEN is set", async () => {
    vi.stubEnv("DASHBOARD_TOKEN", "secret-test-token");
    syncApiServer(apiState, port, ctx);
    await waitForListen(apiState.server!);

    const denied = await fetchJson(`http://127.0.0.1:${port}/api/positions`);
    expect(denied.status).toBe(401);

    const ok = await fetchJson(`http://127.0.0.1:${port}/api/positions`, {
      headers: { Authorization: "Bearer secret-test-token" },
    });
    expect(ok.status).toBe(200);
    expect((ok.body as { positions?: unknown[] }).positions).toEqual([]);
  });
});
