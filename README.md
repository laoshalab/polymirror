# PolyMirror

**Multi-leader copy trading on Polymarket** — mirror trades from multiple leader wallets with per-leader sizing, conflict resolution, and risk controls.

**Polymarket 多 Leader 镜像跟单引擎** — 按 Leader 独立策略缩放仓位，统一风控、去重与冲突处理。

[![CI](https://github.com/your-org/PolyMirror/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/PolyMirror/actions/workflows/ci.yml)

**Version 1.0.0** — single-platform Polymarket multi-leader copy trading (mode A).

---

## Features

| Feature | Description |
|---------|-------------|
| Multi-leader monitor | Parallel poll via Polymarket Data API |
| Sizing | `PERCENTAGE` / `FIXED` / `ADAPTIVE` + tiered multipliers |
| Risk | Daily caps, max markets, slippage, kill switch |
| Conflict | `skip_both` / `net` / `priority_leader` |
| Preview | Dry-run default — no real orders |
| Live | CLOB V2 (`GTC` / `FAK` / `FOK`) with explicit confirm env |
| Notify | Telegram + `GET /health` |
| Persistence | SQLite (trades, positions, audit log) |

---

## Requirements

- Node.js **>= 20** (or Docker)
- Polymarket proxy wallet + USDC (live only)
- Leader proxy addresses or Polymarket usernames

---

## Quick start

### Local (preview recommended)

```bash
git clone <repo-url> PolyMirror && cd PolyMirror
npm install
cp .env.example .env
cp config.preview.template.yaml config.yaml
# Edit .env (wallet) and config.yaml (leaders, preview_mode: true)
npm run dev
```

Health check:

```bash
curl -s http://localhost:8080/health | jq
```

### Docker

```bash
cp .env.example .env && cp config.example.yaml config.yaml
# edit files
docker compose up -d --build
docker compose logs -f
```

Or manual build:

```bash
docker build -t polymirror:1.0.0 .
docker run --rm -p 8080:8080 \
  -v "$PWD/config.yaml:/app/config.yaml:ro" \
  -v "$PWD/data:/app/data" \
  --env-file .env \
  polymirror:1.0.0
```

---

## Configuration

| File | Purpose | Commit? |
|------|---------|---------|
| `.env` | Private key, Telegram, live confirm | **No** |
| `config.yaml` | Leaders, risk, execution | **No** |
| `config.example.yaml` | Template | Yes |
| `data/polymirror.db` | SQLite state | **No** |

Leader example:

```yaml
leaders:
  - id: whale_a
    address: "0x..."
    enabled: true
    strategy:
      type: PERCENTAGE
      copy_size: 10
```

Or resolve by username:

```yaml
  - id: trader_b
    username: "polymarket-handle"
    enabled: true
    strategy:
      type: PERCENTAGE
      copy_size: 5
```

---

## Live trading

**Only after completing the [7-day preview checklist](docs/PREVIEW_CHECKLIST.md).**

1. Set `preview_mode: false` in `config.yaml`
2. Add to `.env`:

```bash
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING
```

3. Use a **dedicated wallet with minimal USDC**
4. Verify first orders on Polymarket UI manually

See [Runbook](docs/RUNBOOK.md) for operations and troubleshooting.

---

## Scripts

```bash
npm run dev      # development (tsx)
npm run build    # compile TypeScript + Dashboard
npm start        # build + run
npm run dev:dashboard  # Vite dev (proxy → :8080, run daemon separately)
npm run lint     # typecheck
npm test         # vitest
npm run audit    # critical-level audit (CI)
```

### Dashboard（M7.1 只读）

构建后访问 `http://127.0.0.1:8080/`（与 `/health` 同端口）。

```bash
# 终端 1：引擎
npm run dev

# 可选：.env 设置 DASHBOARD_TOKEN 启用登录
# 开发时前端热更新（代理 API 到 8080）
npm run dev:dashboard   # → http://localhost:5173
```

页面：**总览** · **Leaders** · **活动流**（只读）。详见 [Dashboard 规划](docs/DASHBOARD_PLAN.md)。

---

## Project layout

```
src/
  config/      Env + YAML load/validate
  leaders/     Registry + username resolve
  monitor/     Data API polling
  engine/      Dedup, sizing, conflict, risk, aggregate
  executor/    CLOB V2 auth + orders
  state/       SQLite
  notify/      Logger, Telegram, health HTTP
docs/          Architecture, runbook, security, checklist
```

---

## Documentation

- **[使用说明书 (User Guide)](docs/USER_GUIDE.md)** — 完整配置与操作指南
- [Development plan](docs/DEVELOPMENT_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Runbook](docs/RUNBOOK.md)
- [Preview checklist (7 days)](docs/PREVIEW_CHECKLIST.md)
- [Security notes](docs/SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Feature survey](docs/FEATURES_SURVEY.md)

---

## Security

- **Never** commit `.env`, private keys, or `config.yaml`
- Default **`preview_mode: true`**
- Use a **dedicated low-balance wallet** for live tests
- Install dependencies from **official npm registry only**
- Do not copy dependencies from unverified copy-bot repos (known malicious patterns)
- Review [SECURITY.md](docs/SECURITY.md) for dependency audit status

---

## License

MIT — see [LICENSE](LICENSE).
