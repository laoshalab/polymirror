# PolyMirror Runbook

Operations guide for running PolyMirror in preview and live mode.

## Prerequisites

- Node.js >= 20
- Polymarket proxy wallet with USDC (live only)
- Leader addresses or Polymarket usernames
- Optional: Telegram bot for alerts

## First-time setup

```bash
cd PolyMirror
npm install
cp .env.example .env
cp config.example.yaml config.yaml
```

Edit `.env`:

- `POLYMARKET_PRIVATE_KEY` — dedicated low-balance wallet only
- `POLYMARKET_ADDRESS` — proxy wallet address on Polymarket

Edit `config.yaml`:

- Set `preview_mode: true` for dry-run
- Enable at least one leader (`enabled: true`)
- Set leader `address` or `username`

## Start (preview)

```bash
npm run dev
```

Expected logs:

- `PolyMirror starting` with leader list
- `Health server listening` on port 8080 (if `health_port > 0`)
- `PREVIEW would copy:` when a leader trade matches

## Health check

```bash
curl -s http://localhost:8080/health | jq
```

Returns:

- `status`: `ok` or `degraded` (kill switch active)
- `previewMode`, `lastPoll`, `enabledLeaders`, `lastError`

Set `health_port: 0` in config to disable.

## Telegram alerts

Set in `.env`:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Notifications fire on:

- Successful copy (preview tagged `[PREVIEW]`)
- Order errors
- Kill switch activation

Toggle per event in `config.yaml` under `notify:`.

## Live trading

**Only after 24h+ successful preview run.**

1. Fund proxy wallet with limited USDC
2. Set `preview_mode: false` in `config.yaml`
3. Add to `.env`:

```bash
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING
```

4. Restart bot and verify first order manually on Polymarket UI

## Kill switch

Triggers automatically when:

- Daily realized loss exceeds `daily_loss_cap_pct` of `starting_capital_usd`

When active:

- No new copies until next UTC day
- `/health` returns HTTP 503
- Telegram alert (if configured)

Manual reset: delete today's row in `daily_stats` or wait until UTC midnight.

## Leader username resolution

Instead of `address`, set:

```yaml
leaders:
  - id: trader_a
    username: "polymarket-handle"
    enabled: true
```

Resolved at startup via Gamma API. Requires network access.

## Trade aggregation

Merge rapid same-token trades before sizing:

```yaml
trade_aggregation_window_ms: 3000
```

`0` disables (default).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No copies | Leader `enabled`? Recent trades on Polymarket? `max_trade_age_hours`? |
| `Copy cycle blocked` | Kill switch, `enable_copy_trading: false`, daily volume cap |
| `Live trading blocked` | Set `POLYMIRROR_LIVE_CONFIRM` |
| `Gamma profile lookup failed` | Username typo or API down — use `address` instead |
| Order errors | CLOB balance, allowance, tick size, min order size |
| Slippage skips | Increase `slippage_tolerance` or use GTC |

## Logs & audit

SQLite database: `data/polymirror.db`

```sql
SELECT * FROM audit_log ORDER BY id DESC LIMIT 20;
SELECT * FROM daily_stats WHERE date = date('now');
```

## Docker

```bash
docker compose up -d --build
curl http://localhost:8080/health
```

Mount `config.yaml`, `.env`, and `data/` — see [README](../README.md#docker).

## Upgrade

```bash
git pull
npm install
npm run lint && npm test
npm run build
# restart process
```

Never commit `.env` or `config.yaml`.
