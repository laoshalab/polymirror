# PolyMirror

**Multi-leader copy trading engine for Polymarket** — mirror trades from multiple leader wallets with per-leader sizing, conflict resolution, risk controls, and a self-hosted Dashboard.

**Polymarket 多 Leader 镜像跟单引擎** — 自托管运行，按 Leader 独立策略缩放仓位，统一风控、去重与冲突处理，内置 Web 控制台。

[![CI](https://github.com/laoshalab/polymirror/actions/workflows/ci.yml/badge.svg)](https://github.com/laoshalab/polymirror/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

**Version 1.0.0** · Single-platform Polymarket multi-leader copy trading (mode A)

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Dashboard](#dashboard)
- [Copy trading pipeline](#copy-trading-pipeline)
- [Live trading](#live-trading)
- [Scripts & development](#scripts--development)
- [Project layout](#project-layout)
- [Documentation](#documentation)
- [Security](#security)
- [License](#license)

---

## Overview

PolyMirror is a **self-hosted copy-trading daemon** for [Polymarket](https://polymarket.com). It polls leader wallets via the Polymarket Data API, applies your sizing and risk rules, and places orders through the CLOB V2 API — or simulates them in **Preview mode** (default).

PolyMirror 不是 Polymarket 交易前端，也不是 Leader 分析站。它专注 **研究之后 → Preview 验证 → Live 执行** 这一段：

```
Predicts.guru / PolyWallet   筛人、观察 PnL
            ↓
       PolyMirror             Preview 7 天 → Live 小额跟单
            ↓
       Dashboard              配置 Leader、看持仓/活动流、切换模式
```

| 属性 | 说明 |
|------|------|
| 部署 | 本地机器或 VPS，单进程 + SQLite |
| 私钥 | 仅存于 `.env`，不上传云端 |
| 默认模式 | `preview_mode: true` — 模拟下单，不调 CLOB |
| 多账户 | 单进程管理多个钱包，Leader 与数据隔离 |
| 控制台 | 内置 React Dashboard，与引擎同端口 |

---

## Features

### Core engine

| Feature | Description |
|---------|-------------|
| **Multi-leader monitor** | Parallel poll via Polymarket Data API; resolve leaders by proxy address or `@username` |
| **Sizing strategies** | `PERCENTAGE` / `FIXED` / `ADAPTIVE` + optional tiered multipliers |
| **Filters** | Price range, sides (BUY/SELL), market allow/block lists |
| **Dedup** | Trade-key dedup + BUY time window to avoid double-copy |
| **Conflict resolution** | `skip_both` / `net` / `priority_leader` when leaders trade opposite sides on same token |
| **Risk gates** | Daily volume caps, max open markets, per-order limits, slippage tolerance, kill switch |
| **Trade aggregation** | Optional window to batch rapid leader fills into one order |
| **SELL safety** | Only copies SELL when local position exists |
| **Settlement & redeem** | Tracks resolved markets; optional on-chain redeem via Relayer (Live) |
| **Unfollow liquidate** | Optional liquidation when disabling a leader |

### Execution & ops

| Feature | Description |
|---------|-------------|
| **Preview mode** | Dry-run default — logs `PREVIEW would copy`, no real orders |
| **Live trading** | CLOB V2 via `@polymarket/client` SecureClient — `GTC` / `FAK` / `FOK` |
| **Live safety gate** | Requires `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING` |
| **Pending orders** | GTC fill timeout, stale order cleanup, manual cancel via API/Dashboard |
| **Multi-account** | `accounts[]` in config — separate wallets, leaders, risk per account |
| **Proxy support** | Static or rotating HTTP proxy for regions where Polymarket API is blocked |
| **Notifications** | Optional Telegram (copy / error / kill switch) |
| **Health HTTP** | `GET /health` — status, kill switch, wallet drift, per-account snapshot |
| **Persistence** | SQLite — positions, audit log, daily stats, pending orders |

### Dashboard (Web UI)

| Page | Purpose |
|------|---------|
| **Overview** | Engine status, PnL summary, quick stats |
| **Discover** | Browse leaderboard traders, add to watchlist |
| **Leaders** | Add/edit leaders, strategy, filters, enable/disable |
| **Positions** | Open positions by token / leader |
| **Orders** | Pending GTC and recent order history |
| **Activity** | Real-time audit stream (COPY / SKIP / ERROR) |
| **Risk** | Kill switch, daily caps, preview/live mode |
| **Account** | Wallet setup, multi-account management |
| **Settings** | Global config, Telegram, proxy, reload |
| **Docs** | In-app help center (links to `docs/dashboard/`) |

Dashboard writes back to `config.yaml` and `.env`; the daemon hot-reloads on change.

---

## Architecture

```
Leaders (N proxy addresses / usernames)
  → Monitor (Data API poll, parallel)
  → Filters + Dedup
  → Sizing (per leader)
  → Conflict resolver
  → Risk gate + Kill switch
  → Executor (CLOB V2 SecureClient)
  → State (SQLite: positions, audit, daily stats)
  → Notify (logger, Telegram, /health)
  ↔ Dashboard REST API + SSE (same process)
```

```mermaid
flowchart LR
  subgraph input [Input]
    L1[Leader A]
    L2[Leader B]
    L3[Leader N]
  end

  subgraph engine [PolyMirror Engine]
    M[Monitor]
    F[Filters & Dedup]
    S[Sizing]
    C[Conflict]
    R[Risk Gate]
    E[Executor]
    DB[(SQLite)]
  end

  subgraph ui [Control Plane]
    D[Dashboard SPA]
    H[/health]
  end

  L1 & L2 & L3 --> M --> F --> S --> C --> R --> E --> DB
  E -->|Live| CLOB[Polymarket CLOB V2]
  M -->|Poll| API[Data API]
  D <-->|REST / SSE| engine
  H --> engine
```

| Module | Path | Role |
|--------|------|------|
| Config | `src/config/` | Load `.env` + `config.yaml`, Zod validation, hot reload |
| Accounts | `src/accounts/` | Multi-account runtime, per-account store |
| Leaders | `src/leaders/` | Registry, username → proxy resolution (Gamma API) |
| Monitor | `src/monitor/` | Fetch activity per leader, poll loop |
| Engine | `src/engine/` | Dedup, sizing, conflict, risk, settlement, pending orders |
| Executor | `src/executor/` | SecureClient, balance, orderbook, redeem |
| State | `src/state/` | SQLite — seen keys, positions, audit, daily stats |
| API | `src/api/` | Dashboard REST routes, discover, PnL, settings |
| Notify | `src/notify/` | Logger, Telegram, health HTTP + static Dashboard |
| Dashboard | `dashboard/` | React 19 + Vite SPA |

See [Architecture](docs/ARCHITECTURE.md) for module details and future roadmap (Web + Agent, cross-venue).

---

## Requirements

| Item | Notes |
|------|-------|
| **Node.js ≥ 20** | Or use Docker |
| **Polymarket wallet** | Proxy address + USDC (Live only; Preview still needs keys for config validation) |
| **Leader addresses** | Proxy wallet `0x…` or Polymarket `@username` |
| **Network** | Mainland China users typically need HTTP proxy — see [Configuration → Proxy](#proxy-network) |
| **Relayer API key** | Optional; required for on-chain redeem (`auto_redeem_on_chain: true`) |

---

## Quick start

### 1. Local (Preview recommended)

```bash
git clone https://github.com/laoshalab/polymirror.git PolyMirror
cd PolyMirror
npm install

cp .env.example .env
cp config.preview.template.yaml config.yaml
```

Edit `.env` (wallet) and `config.yaml` (at least one enabled leader). **Keep `preview_mode: true` for first run.**

```bash
npm run dev
```

Open Dashboard: **http://127.0.0.1:8080/** (same port as `/health`).

Health check:

```bash
curl -s http://127.0.0.1:8080/health | jq
```

Expected: `"status": "ok"`, leaders listed, log shows `PREVIEW would copy` when leaders trade.

### 2. Docker

```bash
cp .env.example .env
cp config.example.yaml config.yaml
# Edit both files — leaders, wallet, preview_mode: true

docker compose up -d --build
docker compose logs -f
```

Docker sets `HEALTH_BIND=0.0.0.0` — set `DASHBOARD_TOKEN` in `.env` for API auth.

Manual image build:

```bash
docker build -t polymirror:1.0.0 .
docker run --rm -p 8080:8080 \
  -v "$PWD/config.yaml:/app/config.yaml:rw" \
  -v "$PWD/.env:/app/.env:rw" \
  -v "$PWD/data:/app/data" \
  --env-file .env \
  polymirror:1.0.0
```

### 3. Find a leader address

1. Open `https://polymarket.com/@username`
2. DevTools → Network → filter `activity` → param `user=0x…` is the proxy wallet
3. Or set `username: "handle"` in config — resolved at startup via Gamma API
4. Verify: `curl "https://data-api.polymarket.com/activity?user=0x...&limit=5"`

---

## Configuration

### Files

| File | Purpose | Commit to git? |
|------|---------|----------------|
| `.env` | Private key, Telegram, live confirm, proxy | **No** |
| `config.yaml` | Leaders, risk, execution, accounts | **No** |
| `config.example.yaml` | Full reference template | Yes |
| `config.preview.template.yaml` | Safe first-run template | Yes |
| `data/*.db` | SQLite state | **No** |

### Environment (`.env`)

Minimal for Preview:

```bash
POLYMARKET_PRIVATE_KEY=<64-char hex>
POLYMARKET_ADDRESS=<0x proxy wallet>
```

When proxy address ≠ EOA: `POLYMARKET_SIGNATURE_TYPE=1`

Optional:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
DASHBOARD_TOKEN=your-random-secret    # required when HEALTH_BIND ≠ 127.0.0.1
HEALTH_PORT=8080
HEALTH_BIND=127.0.0.1
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING   # Live only
```

See [`.env.example`](.env.example) for CLOB credentials, Relayer key, and proxy overrides.

### Global settings (`config.yaml`)

```yaml
global:
  poll_interval_ms: 5000
  preview_mode: true              # ★ keep true until preview checklist done
  health_port: 8080

  risk:
    enable_copy_trading: true
    daily_loss_cap_pct: 20
    starting_capital_usd: 1000
    max_daily_volume_usd: 2000
    max_open_markets: 30
    max_order_usd: 50
    min_order_usd: 1
    slippage_tolerance: 0.03
    max_position_per_token_usd: 0   # 0 = off; wallet-level cap across all leaders
    sync_wallet_balance: true

  execution:
    order_type: GTC                 # GTC | FAK | FOK
    gtc_fill_timeout_ms: 10000
    pending_order_max_age_hours: 48
    auto_redeem_on_chain: true

  conflict:
    mode: priority_leader           # skip_both | net | priority_leader
    priority: []

  notify:
    telegram_on_copy: true
    telegram_on_error: true
    telegram_on_kill_switch: true
```

### Leaders

By address:

```yaml
leaders:
  - id: whale_a
    address: "0x..."
    enabled: true
    weight: 1.0
    strategy:
      type: PERCENTAGE
      copy_size: 10                 # copy 10% of leader notional
    limits:
      max_order_usd: 25
      max_position_usd: 200
    filters:
      min_price: 0.03
      max_price: 0.70
      sides: ["BUY", "SELL"]
```

By username (auto-resolved at startup):

```yaml
  - id: trader_b
    username: "polymarket-handle"
    enabled: true
    strategy:
      type: PERCENTAGE
      copy_size: 5
```

### Strategy types

| Type | `copy_size` meaning |
|------|---------------------|
| `PERCENTAGE` | Leader trade USD × N% |
| `FIXED` | Fixed USD per copy |
| `ADAPTIVE` | Scale down large leader fills, up small ones |

Optional tiered multipliers: `tiered_multipliers: "0-100:1,100-500:0.5,500+:0.25"`

### Multi-account

```yaml
defaults:
  global:
    poll_interval_ms: 5000
    preview_mode: true

accounts:
  - id: main
    label: Main account
    enabled: true
    wallet_env: MAIN              # POLYMARKET_PRIVATE_KEY_MAIN, POLYMARKET_ADDRESS_MAIN
    leaders: [ ... ]
  - id: sub
    label: Sub account
    wallet_env: SUB
    global:
      preview_mode: true
      risk: { max_daily_volume_usd: 300 }
    leaders: [ ... ]
```

Legacy single-account format (`global` + `leaders` at root) remains supported.

### Proxy (network)

For regions where Polymarket APIs are unreachable:

```yaml
global:
  proxy:
    mode: static                  # none | static | dynamic
    static_url: "http://127.0.0.1:7890"
```

Or set `HTTPS_PROXY` / `HTTP_PROXY` in `.env`, or configure via Dashboard **Settings → Network**.

---

## Dashboard

Built-in Web console served at **`http://127.0.0.1:8080/`** after `npm run build` or `npm start`. In development:

```bash
# Terminal 1 — engine
npm run dev

# Terminal 2 — frontend hot reload (proxies API → :8080)
npm run dev:dashboard    # → http://localhost:5173
```

| Concern | Detail |
|---------|--------|
| Auth | Set `DASHBOARD_TOKEN` when binding non-localhost (Docker/VPS) |
| Config writes | Leader edits, settings, wallet keys persist to `config.yaml` / `.env` |
| Reload | Daemon reloads config after API writes — no manual restart in most cases |
| Help | In-app **Docs** page + [Dashboard ops guide](docs/DASHBOARD_OPS.md) |

Recommended flow:

```
Install → Configure wallet → Add leader → Preview 7 days → Tune risk → Live (small size)
```

---

## Copy trading pipeline

Each poll cycle, for every enabled leader:

1. **Fetch** recent activity from Data API
2. **Filter** by age, type, price range, sides, market lists
3. **Dedup** by trade key + BUY window
4. **Conflict check** if multiple leaders hit same token
5. **Size** order per leader strategy (+ tiered multipliers)
6. **Risk gate** — daily volume, open markets, order limits, position caps
7. **Slippage check** (Live) against orderbook
8. **Execute** — Preview log or CLOB order
9. **Persist** — SQLite audit log, positions, daily stats

**Kill Switch:** when daily loss ≥ `starting_capital × daily_loss_cap_pct%`, copy trading stops until UTC next day.

**SELL rule:** copies SELL only when you hold shares for that token; otherwise `SKIP`.

---

## Live trading

> **Only after completing the [7-day preview checklist](docs/PREVIEW_CHECKLIST.md).**

1. Use a **dedicated wallet with minimal USDC** (start ≤ $20)
2. Set `preview_mode: false` in `config.yaml` (or switch via Dashboard **Risk**)
3. Add to `.env`:

```bash
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING
```

4. Restart (or reload if only env changed)
5. **Manually verify first 3 orders** on Polymarket UI
6. Gradually increase limits

Operations and troubleshooting: [Runbook](docs/RUNBOOK.md).

---

## Scripts & development

```bash
npm run dev              # engine (tsx watch)
npm run dev:dashboard    # Vite dev server for Dashboard
npm run build            # tsc + Dashboard production build
npm start                # build daemon + run
npm run lint             # TypeScript check (tsc --noEmit)
npm test                 # vitest unit tests
npm run audit            # npm audit --audit-level=critical (CI)
npm run docker:build     # docker build -t polymirror:1.0.0 .
```

CI runs on push/PR via GitHub Actions (`.github/workflows/ci.yml`): lint, test, audit.

---

## Project layout

```
PolyMirror/
├── src/
│   ├── index.ts           # Entry: load config, start poll loop + HTTP
│   ├── config/            # YAML/env load, Zod schemas, hot reload
│   ├── accounts/          # Multi-account manager
│   ├── leaders/           # Registry, username resolve
│   ├── monitor/           # Data API polling
│   ├── engine/            # Dedup, sizing, conflict, risk, settlement
│   ├── executor/          # CLOB SecureClient, balance, redeem
│   ├── state/             # SQLite store
│   ├── api/               # Dashboard REST + discover/PnL/settings
│   └── notify/            # Logger, Telegram, /health + static UI
├── dashboard/             # React 19 + Vite SPA
├── tests/                 # Vitest unit tests
├── docs/                  # Architecture, runbook, user guide, dashboard help
├── config.example.yaml
├── config.preview.template.yaml
├── docker-compose.yml
├── Dockerfile
└── data/                  # SQLite (gitignored)
```

---

## Documentation

### Getting started

| Document | Description |
|----------|-------------|
| **[User Guide 使用说明书](docs/USER_GUIDE.md)** | Complete configuration and operations |
| [User Guide Summary 精简版](docs/USER_GUIDE_SUMMARY.md) | Print/PDF-friendly condensed guide |
| [Quick Reference 速查表](docs/QUICK_REFERENCE.md) | One-page cheat sheet |
| [Preview Checklist](docs/PREVIEW_CHECKLIST.md) | 7-day Preview before Live |

### Operations & architecture

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Module design and data flow |
| [Runbook](docs/RUNBOOK.md) | Ops, troubleshooting, recovery |
| [Security](docs/SECURITY.md) | Key handling, dependency audit |
| [Development Plan](docs/DEVELOPMENT_PLAN.md) | Milestones and roadmap |

### Dashboard

| Document | Description |
|----------|-------------|
| [Dashboard Ops](docs/DASHBOARD_OPS.md) | Console help index |
| [Dashboard Plan](docs/DASHBOARD_PLAN.md) | UI/UX design spec |
| [docs/dashboard/](docs/dashboard/) | Per-page help (01–08) |

### Product & ecosystem

| Document | Description |
|----------|-------------|
| [Ecosystem Workflow](docs/ECOSYSTEM_WORKFLOW.md) | Tool positioning and user journey |
| [Feature Survey](docs/FEATURES_SURVEY.md) | Competitive landscape |
| [Web + Agent Architecture](docs/WEB_AGENT_ARCHITECTURE.md) | Future cloud control plane (no hosted keys) |
| [Changelog](CHANGELOG.md) | Release history |

---

## Security

- **Never** commit `.env`, private keys, or `config.yaml`
- Default **`preview_mode: true`** — Live requires explicit env confirm
- Use a **dedicated low-balance wallet** for Live testing
- Install dependencies from **official npm registry only**
- Do not copy dependencies from unverified copy-bot repos (known malicious patterns)
- When exposing Dashboard on VPS, always set **`DASHBOARD_TOKEN`** and prefer reverse proxy + TLS
- Review [SECURITY.md](docs/SECURITY.md) for dependency advisories and wallet types

---

## License

[MIT](LICENSE) — Copyright (c) PolyMirror contributors.
