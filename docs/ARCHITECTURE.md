# PolyMirror Architecture

## Scope

Single-platform Polymarket multi-leader copy trading (mode A).

Future: cross-venue execution (Kalshi, Limitless) via a separate matcher layer — not in v0.1.

## Data flow

```
Leaders (N proxy addresses)
  → Monitor (Data API poll)
  → Dedup
  → Sizing (per leader)
  → Conflict resolver
  → Risk gate
  → Executor (CLOB V2)
  → State (SQLite)
```

## Modules

| Module | Path | Role |
|--------|------|------|
| Config | `src/config/` | Load `.env` + `config.yaml`, Zod validation |
| Leaders | `src/leaders/` | Leader registry, enable/disable |
| Monitor | `src/monitor/` | Fetch activity per leader |
| Engine | `src/engine/` | Dedup, sizing, conflict, risk |
| Executor | `src/executor/` | CLOB client, place orders |
| State | `src/state/` | Seen keys, positions, daily stats |
| Notify | `src/notify/` | Logger, optional Telegram |

## MVP milestones

详见 [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) §4。

1. **M1** — 1 leader, preview, poll loop（~90%）
2. **M2** — Multi-leader, dedup, global caps, tests, CI
3. **M3** — Conflict + SELL balance check + audit log
4. **M4** — Live trading (CLOB V2) + kill switch
5. **M5** — Tiered / aggregation / Telegram
6. **M6** — v1.0 release (Docker, RUNBOOK)
