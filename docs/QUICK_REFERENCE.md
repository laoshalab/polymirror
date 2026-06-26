# PolyMirror 速查表

> 一页纸参考 · v1.0.0 · 完整说明见 [USER_GUIDE.md](USER_GUIDE.md)

---

## 30 秒启动

```bash
npm install
cp .env.example .env && cp config.preview.template.yaml config.yaml
# 编辑 .env（私钥+地址）和 config.yaml（Leader）
npm run dev
curl http://127.0.0.1:8081/health   # 端口与 config.yaml 的 health_port 一致
```

---

## 必配项

| 文件 | 必填 |
|------|------|
| `.env` | `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_ADDRESS` |
| `config.yaml` | ≥1 个 `enabled: true` 的 Leader（`address` 或 `username`） |
| | `preview_mode: true`（首次） |

**Proxy 钱包：** 地址 ≠ EOA 时 → `POLYMARKET_SIGNATURE_TYPE=1`

---

## Leader 地址

```bash
# 验证 Leader 有成交
curl "https://data-api.polymarket.com/activity?user=0xLeader地址&limit=5"
```

```yaml
# config.yaml
- id: whale
  address: "0x..."      # 或 username: "handle"
  enabled: true
  strategy: { type: PERCENTAGE, copy_size: 10 }
```

---

## 策略类型

| type | copy_size 含义 |
|------|----------------|
| `PERCENTAGE` | Leader 成交额 × N% |
| `FIXED` | 每笔固定 $N |
| `ADAPTIVE` | 大单缩比、小单放大 |

---

## 关键参数默认值

| 参数 | 默认 | 作用 |
|------|------|------|
| `poll_interval_ms` | 5000 | 轮询间隔 |
| `max_trade_age_hours` | 1 | 忽略旧成交 |
| `max_order_usd` | 50 | 单笔上限 |
| `min_order_usd` | 1 | 低于 skip |
| `daily_loss_cap_pct` | 20 | Kill Switch |
| `preview_mode` | true | 模拟不下单 |

---

## Preview → Live

```yaml
# config.yaml
preview_mode: false
```

```bash
# .env
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING
```

重启 → 人工核对前 3 笔订单。

---

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 开发启动 |
| `npm start` | 编译+运行 |
| `npm test` | 单元测试 |
| `docker compose up -d` | Docker 启动 |

---

## 健康 / 通知

```bash
curl -s localhost:8080/health | jq .status    # ok | degraded
```

```bash
# .env — Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

---

## 审计 SQL

```bash
sqlite3 data/polymirror.db
```

```sql
SELECT action, COUNT(*) FROM audit_log GROUP BY action;
SELECT * FROM daily_stats WHERE date = date('now');
SELECT leader_id, token_id, shares FROM positions WHERE shares > 0;
```

---

## 故障速查

| 现象 | 处理 |
|------|------|
| 无 PREVIEW 日志 | Leader enabled? 地址对? 近期有成交? filters 过严? |
| Live blocked | 设 `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING` |
| EOA 报错 | `POLYMARKET_SIGNATURE_TYPE=1` |
| 循环 blocked | Kill Switch / 日限额 / `enable_copy_trading: false` |
| 下单失败 | 余额、allowance、`min_order_usd`、看 audit ERROR |

---

## 安全三原则

1. **专用小额钱包** — Live 先 ≤ $20  
2. **默认 Preview** — 完成 [PREVIEW_CHECKLIST.md](PREVIEW_CHECKLIST.md)  
3. **勿提交 `.env`** — 勿用来源不明跟单脚本  

---

## 文档索引

| 文档 | 用途 |
|------|------|
| [USER_GUIDE.md](USER_GUIDE.md) | 完整使用说明书 |
| [USER_GUIDE_SUMMARY.md](USER_GUIDE_SUMMARY.md) | 精简版（适合打印 PDF） |
| [PREVIEW_CHECKLIST.md](PREVIEW_CHECKLIST.md) | 7 天验收 |
| [RUNBOOK.md](RUNBOOK.md) | 运维 |
| [SECURITY.md](SECURITY.md) | 安全/依赖 |
