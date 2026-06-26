# PolyMirror 使用说明书（精简版）

**版本 1.0.0 · 打印/PDF 友好 · 完整版：[USER_GUIDE.md](USER_GUIDE.md)**

---

## 1. 这是什么

PolyMirror 在 Polymarket 上跟踪多个 Leader 的成交，按你的策略缩放后自动跟单。默认 **Preview 模拟**，不真实下单。

---

## 2. 安装

**要求：** Node.js ≥ 20，或 Docker。

```bash
cd PolyMirror
npm install
cp .env.example .env
cp config.preview.template.yaml config.yaml
```

---

## 3. 最小配置

### `.env`

```
POLYMARKET_PRIVATE_KEY=<64位hex私钥>
POLYMARKET_ADDRESS=<0x proxy地址>
```

Proxy 与 EOA 不同时加：`POLYMARKET_SIGNATURE_TYPE=1`

### `config.yaml`（节选）

```yaml
global:
  preview_mode: true          # 首次必须 true
  poll_interval_ms: 5000
  risk:
    max_order_usd: 25
    max_daily_volume_usd: 500
    daily_loss_cap_pct: 20
    starting_capital_usd: 500

leaders:
  - id: main
    address: "0x..."          # 或 username: "handle"
    enabled: true
    strategy:
      type: PERCENTAGE
      copy_size: 10
    limits:
      max_order_usd: 20
    filters:
      min_price: 0.05
      max_price: 0.85
      sides: ["BUY", "SELL"]
```

---

## 4. 找 Leader 地址

1. 打开 `https://polymarket.com/@用户名`
2. DevTools → Network → 搜 `activity` → 参数 `user=0x...`
3. 验证：`curl "https://data-api.polymarket.com/activity?user=0x...&limit=5"`

---

## 5. 启动与验证

```bash
npm run dev
curl http://localhost:8080/health
```

**正常：** 日志 `PolyMirror starting`，Leader 成交时出现 `PREVIEW would copy`。

---

## 6. 跟单流程（简述）

轮询 Leader → 过滤 → 去重 → 冲突检查 → 算仓位 → 风控 →（Live 滑点检查）→ 下单 → 写 SQLite。

**SELL：** 仅当本地有持仓才跟；无持仓则 SKIP。

**Kill Switch：** 日亏损 ≥ `starting_capital × daily_loss_cap_pct%` 时停止跟单至 UTC 次日。

---

## 7. 策略

| 类型 | 说明 |
|------|------|
| PERCENTAGE | 跟 Leader 金额 × N% |
| FIXED | 每笔固定 USD |
| ADAPTIVE | 大单缩比 |

可选：`tiered_multipliers: "0-100:1,100-500:0.5,500+:0.25"`

---

## 8. 多 Leader 冲突

`conflict.mode`：`skip_both` | `net` | `priority_leader`（默认）

同 token 反向时按模式处理；`priority` 列表或 `weight` 决定优先级。

---

## 9. 实盘上线（Preview 7 天后）

1. 钱包充 **≤ $20** 测试 USDC  
2. `config.yaml` → `preview_mode: false`  
3. `.env` → `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING`  
4. 重启，在 Polymarket 网页 **人工核对前 3 笔**  
5. 逐步放大限额  

详见 [PREVIEW_CHECKLIST.md](PREVIEW_CHECKLIST.md)。

---

## 10. Telegram（可选）

`.env`：`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`  
`config.yaml` → `notify:` 控制 copy / error / kill_switch 通知。

---

## 11. Docker

```bash
docker compose up -d --build
docker compose logs -f
```

挂载：`config.yaml`、`.env`、`data/`。

---

## 12. 常用 SQL

```sql
-- 最近审计
SELECT datetime(ts/1000,'unixepoch'), action, leader_id, side, reason
FROM audit_log ORDER BY id DESC LIMIT 20;

-- 今日统计 / Kill Switch
SELECT * FROM daily_stats WHERE date = date('now');

-- 持仓
SELECT * FROM positions WHERE shares > 0;
```

数据库路径：`data/polymirror.db`

---

## 13. 常见问题

| 问题 | 解决 |
|------|------|
| 无跟单日志 | 查 Leader 地址、enabled、近期成交、filters |
| Live 拒绝启动 | 设置 `POLYMIRROR_LIVE_CONFIRM` |
| 签名/EOA 错误 | `POLYMARKET_SIGNATURE_TYPE=1` |
| 临时停止 | `enable_copy_trading: false` 或停进程 |

---

## 14. 安全

- 专用小额钱包，勿用主钱包  
- 勿提交 `.env` / `config.yaml`  
- 仅官方 npm；勿用可疑跟单仓库  
- 默认 Preview；实盘需显式确认  

详情：[SECURITY.md](SECURITY.md)

---

## 15. 文档

| 文档 | 说明 |
|------|------|
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | 一页速查表 |
| [USER_GUIDE.md](USER_GUIDE.md) | 完整说明书 |
| [RUNBOOK.md](RUNBOOK.md) | 运维 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本记录 |

---

*PolyMirror v1.0.0 · MIT License*
