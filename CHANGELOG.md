# Changelog

All notable changes to PolyMirror are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-24

First stable release — single-platform Polymarket multi-leader copy trading (mode A).

### Added

- Multi-leader polling via Polymarket Data API (parallel fetch)
- Per-leader sizing: `PERCENTAGE`, `FIXED`, `ADAPTIVE`, tiered multipliers
- Filters: price range, sides, market allow/block lists
- Dedup: trade key + BUY time window
- Conflict resolution: `skip_both`, `net`, `priority_leader`
- Risk gates: daily volume caps, max open markets, slippage tolerance, kill switch
- Preview mode (default) — dry-run without CLOB orders
- Live CLOB V2 execution: GTC / FAK / FOK via `@polymarket/clob-client-v2`
- Live safety gate: `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING`
- SQLite persistence: positions, audit log, daily stats
- Trade aggregation window (`trade_aggregation_window_ms`)
- Telegram notifications (copy / error / kill switch)
- HTTP health endpoint (`GET /health`)
- Leader username → proxy resolution (Gamma API)
- Vitest unit tests + GitHub Actions CI
- Docker multi-stage image
- Runbook, preview checklist, security notes

### Security

- Private keys loaded from `.env` only; never logged
- Default `preview_mode: true`
- Documented transitive dependency advisories in `docs/SECURITY.md`

## [0.1.0] - 2026-06-24

Initial development scaffold (M1 preview loop).

[1.0.0]: https://github.com/your-org/PolyMirror/releases/tag/v1.0.0
[0.1.0]: https://github.com/your-org/PolyMirror/releases/tag/v0.1.0
