# Preview Checklist (7 days)

Complete this checklist in **`preview_mode: true`** before enabling live trading.

Mark each item when done. Keep logs and `data/polymirror.db` for review.

---

## Day 0 — Setup

- [ ] Copied `.env.example` → `.env` (wallet filled; **dedicated low-balance wallet**)
- [ ] Copied `config.example.yaml` → `config.yaml`
- [ ] At least one leader `enabled: true` with valid `address` or `username`
- [ ] `preview_mode: true` confirmed in `config.yaml`
- [ ] `npm install && npm run lint && npm test` pass locally
- [ ] Bot starts: `npm run dev` — no fatal errors
- [ ] `curl http://localhost:8080/health` returns `"status":"ok"`

## Day 1–2 — Detection

- [ ] Leaders show recent activity on [polymarket.com](https://polymarket.com) (trades within `max_trade_age_hours`)
- [ ] Logs show `DETECT` / poll activity when leaders trade
- [ ] Filters behave as expected (check `audit_log` SKIP reasons if trades filtered)
- [ ] No duplicate copies for same leader trade after restart (`seen_trades` works)

```sql
sqlite3 data/polymirror.db "SELECT action, COUNT(*) FROM audit_log GROUP BY action;"
```

## Day 3–4 — Sizing & risk

- [ ] Preview `PREVIEW would copy` sizes match expected % / fixed / adaptive math
- [ ] `max_order_usd` / `min_order_usd` caps observed in skip or copy reasoning
- [ ] Daily volume counters increment (`daily_stats` table)
- [ ] If multiple leaders: conflict mode behaves (no opposing fills on same token)

## Day 5 — Stability

- [ ] Process runs ≥ 24h without crash (use `tmux`, `systemd`, or Docker)
- [ ] Memory stable (no unbounded growth)
- [ ] Health endpoint stays reachable
- [ ] Telegram alerts fire on preview copies (if configured)

## Day 6 — Edge cases

- [ ] SELL signals without local position → SKIP (not fatal error)
- [ ] Kill switch test: temporarily lower `daily_loss_cap_pct` + inject test PnL, or wait for natural trigger in staging
- [ ] Slippage / aggregation settings reviewed (defaults OK for first live)

## Day 7 — Go / no-go

- [ ] Reviewed full `audit_log` for false positives / missed trades
- [ ] Comfortable with leader list and per-leader limits
- [ ] Read [SECURITY.md](SECURITY.md) and [RUNBOOK.md](RUNBOOK.md)
- [ ] Live checklist ready:
  - [ ] `preview_mode: false`
  - [ ] `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING`
  - [ ] Wallet funded with **minimal** test USDC (≤ $20 first session)
  - [ ] Manual verification plan for first 3 live orders on Polymarket UI

---

## Sign-off

| Field | Value |
|-------|-------|
| Preview start date | |
| Preview end date | |
| Leaders followed | |
| Approx. preview copies | |
| Issues found | |
| Approved for live | yes / no |

**If any critical issue remains, stay in preview until resolved.**
