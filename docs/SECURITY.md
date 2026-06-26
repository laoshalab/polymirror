# PolyMirror — Security Notes

## Threat model (v1.0)

PolyMirror runs as a long-lived Node process with access to:

- Your Polymarket wallet private key (`.env`)
- Outbound HTTPS to Polymarket APIs (Data API + CLOB) and optional Telegram
- Local SQLite state and `config.yaml`

The bundled **Dashboard** exposes a REST API that can **read and mutate** config (leaders, risk, preview/live mode, proxy, accounts). Treat the HTTP server as a **control plane**, not read-only.

## Dashboard & API auth

| Rule | Why |
|------|-----|
| Set **`DASHBOARD_TOKEN`** when binding to non-localhost | `HEALTH_BIND=0.0.0.0` (Docker) without a token leaves all write APIs open |
| Use **`Authorization: Bearer <token>`** only | Query-string tokens are not supported |
| Prefer **`HEALTH_BIND=127.0.0.1`** on bare metal | Reverse-proxy TLS if exposing remotely |
| Startup **fails** if bind is public and token is missing | Prevents accidental open control plane |

Live trading gates:

- **`POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING`** required at process start, when switching to Live via API, and when **`POST /api/config/reload`** loads a config with `preview_mode: false`.
- Live copies persist **dedup + GTC pending + fills** atomically via `recordLiveOrderAccepted`; open orders are checked before re-submit.
- Set **`REQUIRE_LIVE_CONFIRM=false`** only if you accept bypassing this gate entirely.

## Operational requirements

| Rule | Why |
|------|-----|
| Use a **dedicated wallet** with limited USDC | Limits blast radius if key leaks |
| Start with **`preview_mode: true`** | No real orders until validated |
| Never commit `.env`, `.env.bak`, `config.yaml`, `config.yaml.bak` | Secrets stay local (see `.gitignore`) |
| Install only from **registry.npmjs.org** | Supply-chain hygiene |

## Proxy credentials

- Proxy URLs (may contain `user:pass`) are stored in `config.yaml`.
- The settings API returns **masked** URLs to the Dashboard; leave the input empty to keep the existing URL, or enter a new one to replace it.
- Proxy applies to **Data API fetch** and **CLOB (axios)** traffic when configured.

## Logging

- Private keys, API secrets, and passphrases are **never** written to logs.
- Order errors may include token IDs and CLOB messages — review before sharing logs.

## Dependency audit

```bash
npm audit --audit-level=high   # may report transitive issues
npm audit --audit-level=critical  # passes on v1.0.0
```

**Do not** run `npm audit fix --force` — it downgrades `@polymarket/clob-client-v2` and breaks live trading.

CI runs `npm audit --audit-level=critical`.

## Reporting

If you find a security issue in PolyMirror itself, open a private report to the maintainer (do not post private keys in public issues).
