# PolyMirror 使用说明书

**版本：** 1.0.0  
**适用场景：** Polymarket 单平台、多 Leader 镜像跟单（Mode A）

---

## 目录

1. [产品简介](#1-产品简介)
2. [使用前准备](#2-使用前准备)
3. [安装与首次启动](#3-安装与首次启动)
4. [配置文件详解](#4-配置文件详解)
5. [如何添加 Leader](#5-如何添加-leader)
6. [运行模式](#6-运行模式)
7. [跟单逻辑说明](#7-跟单逻辑说明)
8. [策略与风控](#8-策略与风控)
9. [通知与监控](#9-通知与监控)
10. [Docker 部署](#10-docker-部署)
11. [实盘上线流程](#11-实盘上线流程)
12. [日志与审计](#12-日志与审计)
13. [常见问题](#13-常见问题)
14. [安全须知](#14-安全须知)
15. [相关文档](#15-相关文档)

---

## 1. 产品简介

PolyMirror 是一个运行在本地或服务器上的 **Polymarket 跟单机器人**。它会：

1. 轮询你配置的多个 **Leader**（被跟单者）的近期成交；
2. 按你为每个 Leader 设定的策略 **缩放仓位**；
3. 经过去重、过滤、冲突处理、风控检查后；
4. 在 **Preview（模拟）** 或 **Live（实盘）** 模式下向 Polymarket CLOB 下单。

### 核心能力

| 能力 | 说明 |
|------|------|
| 多 Leader | 同时跟踪多个地址/用户名 |
| 策略 | 按比例 / 固定金额 / 自适应 + 分层 multiplier |
| 风控 | 日限额、单笔上下限、最大持仓市场数、Kill Switch |
| 冲突处理 | 多 Leader 对同一市场反向时的处理策略 |
| Preview | 默认开启，不真实下单 |
| 持久化 | SQLite 记录已处理成交、持仓、审计日志、GTC 挂单 |

### 不包含（v1.0）

- 跨平台（Kalshi / Limitless 等）跟单
- 全自动链上持仓校正（仅 drift 告警 + SELL 校验，不自动改写 SQLite）

> **Web 管理界面：** 运行 `npm run dev` 且 `health_port > 0` 时，可通过 Dashboard（如 `http://127.0.0.1:8081`）完成配置与监控；详见控制台 **操作文档** 页。

---

## 2. 使用前准备

### 2.1 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 20（推荐 LTS） |
| 操作系统 | Linux / macOS / Windows（WSL 推荐） |
| 网络 | 可访问 Polymarket Data API、CLOB API |
| 磁盘 | 少量空间（SQLite 数据库） |

或使用 **Docker**（见 [第 10 节](#10-docker-部署)），无需本地安装 Node。

### 2.2 账号与资金

| 项目 | Preview | Live |
|------|---------|------|
| Polymarket 钱包 | 需要配置（校验用） | 必须 |
| Proxy 地址 | 需要 | 必须 |
| USDC 余额 | 不需要 | 需要（建议先用小额） |
| Leader 列表 | 至少 1 个 | 至少 1 个 |

> **重要：** 请使用 **专用小额钱包** 做跟单，不要使用主钱包或存放大量资金的钱包。

### 2.3 文件清单

运行前需准备以下本地文件（均 **不要提交到 Git**）：

| 文件 | 作用 |
|------|------|
| `.env` | 私钥、Telegram、实盘确认等敏感信息 |
| `config.yaml` | Leader、策略、风控、轮询参数 |
| `data/preview.db` | Preview 模式 SQLite（与 Live 隔离） |
| `data/polymirror.db` | Live 模式 SQLite（运行后自动生成） |

模板文件（可提交 Git）：

| 模板 | 说明 |
|------|------|
| `.env.example` | 环境变量模板 |
| `config.preview.template.yaml` | 带完整注释的 Preview 配置 |
| `config.example.yaml` | 最小配置示例 |

---

## 3. 安装与首次启动

### 3.1 本地安装

```bash
cd PolyMirror
npm install
cp .env.example .env
cp config.preview.template.yaml config.yaml
```

### 3.2 编辑 `.env`

最少填写两项：

```bash
POLYMARKET_PRIVATE_KEY=你的64位十六进制私钥
POLYMARKET_ADDRESS=0x你的Polymarket代理钱包地址
```

私钥格式：`0x` 开头 64 位 hex，或不带 `0x` 的 64 位 hex 均可。

**Proxy 钱包说明：** Polymarket 上实际交易使用的是 proxy 地址，通常与 EOA 不同。若 `POLYMARKET_ADDRESS` 与私钥推导出的 EOA 不一致，需设置：

```bash
POLYMARKET_SIGNATURE_TYPE=1
```

### 3.3 编辑 `config.yaml`

1. 将 `leader_main` 的 `address` 或 `username` 改为真实 Leader；
2. 确认 `preview_mode: true`；
3. 确认至少一个 Leader 的 `enabled: true`。

详见 [第 4、5 节](#4-配置文件详解)。

### 3.4 启动（Preview）

```bash
npm run dev
```

**正常启动日志示例：**

```
[polymirror] PolyMirror starting {"preview":true,"leaders":[...],"pollMs":5000}
[polymirror] Health server listening {"port":8080,"path":"/health"}
[polymirror] Poll complete {"fetched":...,"copied":0,"skipped":...}
```

当 Leader 有新成交且通过过滤时：

```
[polymirror] PREVIEW would copy: {"leader":"leader_main","side":"BUY",...}
```

### 3.5 健康检查

```bash
curl -s http://localhost:8080/health | jq
```

返回 `status: "ok"` 表示进程正常；Kill Switch 激活时为 `"degraded"`（HTTP 503）。

### 3.6 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式启动（tsx，改代码可重启） |
| `npm start` | 编译 + 生产模式启动 |
| `npm run build` | 仅编译 TypeScript |
| `npm run lint` | 类型检查 |
| `npm test` | 运行单元测试 |

---

## 4. 配置文件详解

配置文件为 YAML 格式，默认路径：`config.yaml`（项目根目录）。

也可通过修改代码或后续版本支持 `CONFIG_PATH` 环境变量指定路径；v1.0 默认读取 `./config.yaml`。

### 4.1 全局参数 `global`

```yaml
global:
  poll_interval_ms: 5000        # 轮询间隔（毫秒），最小 1000
  activity_limit: 100           # 每个 Leader 每次拉取 activity 条数
  preview_mode: true            # true=模拟，false=实盘
  copy_trades_only: true        # 只处理 TRADE 类型
  max_trade_age_hours: 1        # 忽略超过 N 小时的 Leader 成交
  buy_dedup_window_ms: 60000    # 同 token BUY 去重窗口（毫秒）
  trade_aggregation_window_ms: 0  # 碎单合并窗口，0=关闭
  health_port: 8080             # 健康检查端口，0=关闭
```

| 参数 | 建议值 | 说明 |
|------|--------|------|
| `poll_interval_ms` | 5000–15000 | Leader 多时适当加大，降低 API 压力 |
| `max_trade_age_hours` | 1 | 防止重启后跟旧单；Leader 交易稀疏可适当增大 |
| `trade_aggregation_window_ms` | 0 或 3000–5000 | Leader 连续碎单时可开启合并 |

### 4.2 风控 `global.risk`

```yaml
  risk:
    enable_copy_trading: true     # false 时全局停止跟单
    daily_loss_cap_pct: 20        # 日亏损达本金 N% 触发 Kill Switch
    starting_capital_usd: 500       # Kill Switch 计算基准
    max_daily_volume_usd: 500       # 全局日跟单成交额上限
    max_open_markets: 15            # 最多同时持有多少个 token
    max_order_usd: 25               # 全局单笔上限
    min_order_usd: 1                # 低于此金额 skip
    slippage_tolerance: 0.03        # 实盘滑点容忍（绝对值，非百分比）
    max_position_per_token_usd: 0   # 单 token 跨 Leader 合计敞口上限（USD），0=不限制
    sync_wallet_balance: true       # Live：SELL 时对照 CLOB 链上余额
```

**Kill Switch：** 当 SQLite 记录的当日 **已实现亏损** 达到 `starting_capital_usd × daily_loss_cap_pct%` 时，自动停止一切新跟单，直至 UTC 次日。

**跨 Leader 集中度：** 多个 Leader 共用同一钱包。`max_position_per_token_usd` 限制同一 token 的合计敞口（按本地持仓 × 价格估算）。

### 4.3 执行 `global.execution`

```yaml
  execution:
    order_type: GTC    # GTC | FAK | FOK
    retry_limit: 3
    network_retry_limit: 3
    gtc_fill_timeout_ms: 10000       # GTC 初次下单后等待成交的最长时间（毫秒）
    pending_order_max_age_hours: 48  # 超时未完结的 pending 记录保留上限
```

| 类型 | 行为 |
|------|------|
| `GTC` | 限价挂单；初次轮询 `gtc_fill_timeout_ms`；未成交部分写入 `pending_orders` 并在后续轮次继续跟踪 |
| `FAK` | 市价类，部分成交其余取消 |
| `FOK` | 市价类，全部成交否则取消 |

Preview 模式下不会真正调用 CLOB；Preview 使用独立数据库 `data/preview.db`，不会污染 Live 状态。

### 4.4 冲突 `global.conflict`

当多个 Leader 对 **同一 token** 发出 **反向** 信号（一买一卖）时：

```yaml
  conflict:
    mode: priority_leader   # skip_both | net | priority_leader
    priority: []            # Leader id 优先级列表，空则按 weight
```

| 模式 | 行为 |
|------|------|
| `skip_both` | 两笔都跳过 |
| `net` | 都允许（可能对冲） |
| `priority_leader` | 高优先级 Leader 获胜 |

### 4.5 通知 `global.notify`

```yaml
  notify:
    telegram_on_copy: true
    telegram_on_error: true
    telegram_on_kill_switch: true
```

需在 `.env` 中配置 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID` 才生效。

### 4.6 Leader 配置 `leaders[]`

每个 Leader 是一个列表项：

```yaml
leaders:
  - id: leader_main              # 唯一别名，用于日志和 priority
    address: "0x..."             # 方式 A：proxy 地址
    # username: "handle"         # 方式 B：Polymarket 用户名（二选一）
    enabled: true
    weight: 1.0                  # 冲突时的权重
    strategy:
      type: PERCENTAGE           # PERCENTAGE | FIXED | ADAPTIVE
      copy_size: 10.0
    limits:
      max_order_usd: 20
      max_position_usd: 150
      max_daily_volume_usd: 300
    filters:
      min_price: 0.05
      max_price: 0.85
      sides: ["BUY", "SELL"]
      # markets_blocklist: ["sports"]
      # markets_allowlist: ["election"]
```

---

## 5. 如何添加 Leader

### 5.1 方式 A：Proxy 地址（推荐）

**步骤：**

1. 打开 Leader 的 Polymarket 主页：`https://polymarket.com/@用户名`
2. 浏览器开发者工具 → Network → 筛选 `activity` 或 `profile`
3. 找到请求参数 `user=0x...`，即为 **proxy wallet**

**验证地址是否有效：**

```bash
curl "https://data-api.polymarket.com/activity?user=0xLeader地址&limit=5"
```

若返回 JSON 数组且有 `type: "TRADE"` 记录，说明地址正确且近期有交易。

**写入配置：**

```yaml
- id: my_whale
  address: "0xabcdef..."
  enabled: true
  strategy:
    type: PERCENTAGE
    copy_size: 10
```

### 5.2 方式 B：用户名

```yaml
- id: my_whale
  username: "polymarket-handle"   # 不要带 @
  enabled: true
  strategy:
    type: PERCENTAGE
    copy_size: 10
```

启动时通过 Gamma API 解析为 proxy 地址。需要外网；解析失败时请改用手动 `address`。

### 5.3 多 Leader 示例

```yaml
leaders:
  - id: whale_a
    address: "0x..."
    enabled: true
    weight: 1.0
    strategy:
      type: PERCENTAGE
      copy_size: 10

  - id: whale_b
    address: "0x..."
    enabled: true
    weight: 0.5
    strategy:
      type: FIXED
      copy_size: 5
```

配合 `conflict.mode: priority_leader` 和 `priority: ["whale_a", "whale_b"]` 使用。

---

## 6. 运行模式

### 6.1 Preview 模式（默认，推荐先用）

```yaml
global:
  preview_mode: true
```

- **不会**向 Polymarket 发送真实订单
- 仍会轮询 Leader、计算仓位、写 audit 日志
- 使用 **`data/preview.db`**，与 Live 的 `data/polymirror.db` 完全隔离
- 日志前缀：`PREVIEW would copy`
- Telegram 通知会标注 `[PREVIEW]`

**适用：** 验证 Leader 是否正确、策略是否合理、过滤是否过严/过松。

上线前请完成 [`PREVIEW_CHECKLIST.md`](PREVIEW_CHECKLIST.md)（建议 7 天）。

### 6.2 Live 模式（实盘）

**前置条件：**

- [ ] Preview 运行稳定，审计日志符合预期
- [ ] 钱包已充值 **少量** USDC
- [ ] 已阅读 [安全须知](#14-安全须知)

**步骤：**

1. 修改 `config.yaml`：

```yaml
global:
  preview_mode: false
```

2. 修改 `.env`：

```bash
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING
```

3. 重启进程：

```bash
npm run dev
# 或 npm start / docker compose restart
```

4. 在 Polymarket 网页端 **人工核对前几笔** 订单的 token、方向、数量。

> 若未设置 `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING`，程序会拒绝启动实盘。

---

## 7. 跟单逻辑说明

每一轮轮询（Poll Cycle）按以下顺序处理：

```
处理 pending GTC 挂单（Live：轮询 CLOB 成交）
    ↓
钱包持仓 drift 检查（Live + sync_wallet_balance）
    ↓
轮询所有 enabled Leader（并行，单 Leader 失败不影响其他）
    ↓
合并候选成交（可选 aggregation）
    ↓
对每笔成交：
    DETECT → 过滤器 → 去重 → 冲突检查 → 计算仓位
    → 风控 → SELL 持仓检查（含链上余额） → 滑点检查（仅 Live）
    → 下单 → 等待/记录成交 → 更新 SQLite → 未成交 GTC 写入 pending
    → 通知
```

### 7.1 去重

- **成交级去重：** 同一 `transactionHash + token + side` 不会处理两次（重启后仍有效）
- **BUY 窗口去重：** 同一 Leader 同一 token 在 `buy_dedup_window_ms` 内不会重复 BUY

### 7.2 GTC 挂单跟踪（pending_orders）

Live + `order_type: GTC` 时：

1. 下单后在 `gtc_fill_timeout_ms` 内轮询 CLOB 成交；
2. **已成交部分** 立即写入持仓与 audit；
3. **未成交部分** 写入 SQLite 表 `pending_orders`，后续每轮继续轮询；
4. 后续成交时补写持仓，Telegram 标注 `pending fill`；
5. 超过 `pending_order_max_age_hours` 的记录自动清理。

> 建议实盘跟单优先使用 `FAK`，减少挂单等待；若用 GTC，可适当增大 `gtc_fill_timeout_ms`。

### 7.3 SELL 规则

跟 Leader 卖出时检查 **本地 SQLite 持仓**。Live 模式下若 `sync_wallet_balance: true`，还会：

1. 通过 CLOB API 查询该 token **链上余额**；
2. 按各 Leader 本地持仓比例分配可卖份额；
3. 取 `min(Leader 本地持仓, 分配份额)` 作为实际上限。

- 若可卖份额 < 需要卖出的份额 → **SKIP**
- 每轮 drift 检查：链上余额与本地合计持仓偏差 > 0.02 时写入日志与 `/health`

### 7.4 过滤跳过

被跳过的成交会写入 `audit_log`，`action = SKIP`，`reason` 字段说明原因。常见原因：

| reason | 含义 |
|--------|------|
| `price x < min y` | 价格低于下限 |
| `side SELL not allowed` | 方向被 filters 排除 |
| `blocked market keyword` | 命中 blocklist |
| `recent buy dedup` | BUY 去重窗口内 |
| `conflict skip_both` | 多 Leader 冲突 |
| `max open markets` | 超过最大市场数 |
| `global max daily volume` | 超过日限额 |
| `token exposure ...` | 超过单 token 跨 Leader 敞口上限 |
| `slippage ...` | 实盘滑点超限 |
| `slippage reference price unavailable` | 无法获取 orderbook 参考价（Live） |
| `GTC pending (...)` | GTC 已提交，挂单跟踪中 |
| `order submitted — no fill` | 订单已接受但未成交（非 GTC pending） |

---

## 8. 策略与风控

### 8.1 PERCENTAGE（按比例）

```yaml
strategy:
  type: PERCENTAGE
  copy_size: 10.0    # 跟 Leader 成交额的 10%
```

示例：Leader 买入 $100 → 你跟 $10。

### 8.2 FIXED（固定金额）

```yaml
strategy:
  type: FIXED
  copy_size: 5.0     # 每笔固定 $5
```

### 8.3 ADAPTIVE（自适应）

```yaml
strategy:
  type: ADAPTIVE
  copy_size: 10.0
  adaptive_min_percent: 5
  adaptive_max_percent: 20
  adaptive_threshold_usd: 500
```

Leader 成交越大，跟单比例越小（避免大单过度放大）。

### 8.4 分层 Multiplier（Tiered）

```yaml
strategy:
  type: PERCENTAGE
  copy_size: 10
  tiered_multipliers: "0-100:1,100-500:0.75,500+:0.5"
```

按 Leader **单笔成交额** 区间应用不同倍率。

### 8.5 限额叠加顺序

1. 策略计算基础金额
2. Tiered multiplier（如有）
3. `leader.limits.max_order_usd` 与 `global.risk.max_order_usd` 取较小值
4. `leader.limits.max_position_usd` 限制 BUY 剩余空间
5. `global.risk.max_position_per_token_usd` 限制单 token 跨 Leader 合计敞口
6. `global.risk.min_order_usd` 以下 skip

---

## 9. 通知与监控

### 9.1 Telegram

**创建 Bot：**

1. Telegram 搜索 `@BotFather` → `/newbot` → 获取 `BOT_TOKEN`
2. 与你的 Bot 对话发一条消息
3. 访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` 获取 `chat.id`

**配置 `.env`：**

```bash
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=你的chat_id
```

**通知类型：**

| 事件 | 内容 |
|------|------|
| 跟单成功 | `[PREVIEW]` 或 `[LIVE]` + Leader / 方向 / 金额 |
| GTC 延迟成交 | `[LIVE] pending fill ...` |
| 下单错误 | 错误信息 |
| Kill Switch | 熔断提示 |

### 9.2 HTTP 健康检查与 Dashboard

引擎在 `health_port`（默认 **8080**）同时提供：

| 路径 | 说明 |
|------|------|
| `/` | **Dashboard 只读 UI**（需先 `npm run build`） |
| `/health` | JSON 健康检查 |
| `/api/*` | Dashboard REST API |

默认监听 **`127.0.0.1`**。Docker Compose 已设置 `HEALTH_BIND=0.0.0.0`。

**Dashboard 登录（可选）：** 在 `.env` 设置 `DASHBOARD_TOKEN=随机字符串` 后，打开 `http://localhost:8080/login` 输入 Token。

**开发模式：**

```bash
npm run dev              # 终端 1：引擎 :8080
npm run dev:dashboard    # 终端 2：前端 :5173（API 代理到 8080）
```

```bash
curl http://localhost:8080/health
curl -H "Authorization: Bearer $DASHBOARD_TOKEN" http://localhost:8080/api/status
```

**主要字段：**

| 字段 | 说明 |
|------|------|
| `status` | `ok` / `degraded` |
| `previewMode` | 是否 Preview |
| `killSwitchActive` | Kill Switch 是否激活 |
| `lastPoll` | 上一轮 `{ fetched, copied, skipped, pendingFilled, errors }` |
| `pendingOrders` | 当前跟踪中的 GTC 挂单数 |
| `walletDrifts` | 链上余额 vs 本地持仓偏差（token 摘要列表） |
| `enabledLeaders` | 当前启用的 Leader id 列表 |

可用于 systemd、Docker HEALTHCHECK、Uptime 监控。

### 9.3 后台持久运行

**tmux 示例：**

```bash
tmux new -s polymirror
npm run dev
# Ctrl+B D  detach
```

**systemd 示例（`/etc/systemd/system/polymirror.service`）：**

```ini
[Unit]
Description=PolyMirror copy bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/PolyMirror
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## 10. Docker 部署

### 10.1 准备文件

```bash
cp .env.example .env
cp config.preview.template.yaml config.yaml
# 编辑 .env 和 config.yaml
```

### 10.2 启动

```bash
docker compose up -d --build
docker compose logs -f
```

### 10.3 挂载说明

`docker-compose.yml` 默认挂载：

| 宿主机 | 容器 | 说明 |
|--------|------|------|
| `./config.yaml` | `/app/config.yaml` | 只读配置 |
| `./data` | `/app/data` | SQLite 持久化（`preview.db` / `polymirror.db`） |
| `.env` | env_file | 敏感信息 |

容器内默认 `HEALTH_BIND=0.0.0.0`，以便 `-p 8080:8080` 端口映射生效。

### 10.4 健康检查

```bash
curl http://localhost:8080/health
```

---

## 11. 实盘上线流程

建议按以下顺序操作：

```
① Preview 7 天（见 PREVIEW_CHECKLIST.md）
    ↓
② 核对 audit_log、策略计算、过滤规则
    ↓
③ 钱包充入 ≤ $20 测试 USDC
    ↓
④ preview_mode: false + POLYMIRROR_LIVE_CONFIRM
    ↓
⑤ 重启，人工核对前 3 笔订单
    ↓
⑥ 逐步放大 copy_size / 限额
```

**切勿跳过 Preview 直接实盘。**

---

## 12. 日志与审计

### 12.1 控制台日志

| 前缀 | 含义 |
|------|------|
| `[polymirror]` | 一般信息 |
| `[polymirror] ERROR` | 错误 |
| `PREVIEW would copy` | Preview 模拟跟单 |

日志 **不会** 输出私钥或 API Secret。

### 12.2 SQLite 数据库

路径：`data/polymirror.db`

**常用查询：**

```bash
sqlite3 data/polymirror.db
```

```sql
-- 最近 20 条审计
SELECT datetime(ts/1000,'unixepoch'), leader_id, action, side, size, price, reason
FROM audit_log ORDER BY id DESC LIMIT 20;

-- 今日统计
SELECT * FROM daily_stats WHERE date = date('now');

-- 当前持仓
SELECT leader_id, token_id, shares, avg_entry_price
FROM positions WHERE shares > 0;

-- 各 action 计数
SELECT action, COUNT(*) FROM audit_log GROUP BY action;
```

### 12.3 手动重置 Kill Switch

```sql
UPDATE daily_stats SET kill_switch = 0 WHERE date = date('now');
```

或等到 UTC 0 点后自动以新日期的记录为准（若当日无触发则不影响）。

---

## 13. 常见问题

### Q1：启动后没有任何 `PREVIEW would copy`

**排查清单：**

1. Leader 是否 `enabled: true`？
2. Leader 地址/用户名是否正确？用 curl 验证 activity API
3. Leader 近期是否有成交（`max_trade_age_hours` 内）？
4. `filters` 是否过严（价格区间、sides、blocklist）？
5. `enable_copy_trading` 是否为 `true`？
6. Kill Switch 是否已激活？查 `/health` 或 `daily_stats`

### Q2：报错 `POLYMARKET_PRIVATE_KEY is required`

`.env` 未配置或路径不对。确保在项目根目录运行，且 `.env` 与 `config.yaml` 同级。

### Q3：报错 `POLYMARKET_ADDRESS differs from EOA`

Proxy 钱包与私钥 EOA 不一致，添加：

```bash
POLYMARKET_SIGNATURE_TYPE=1
```

### Q4：报错 `Live trading blocked`

实盘需设置：

```bash
POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING
```

### Q5：Preview 正常，Live 下单失败

1. 检查 USDC 余额与 allowance
2. 检查 `min_order_usd` 是否低于 Polymarket 最小下单
3. 查看 audit_log 中 `action=ERROR` 的 `reason`
4. 尝试 `order_type: GTC` 并适当增大 `slippage_tolerance`

### Q6：重启后会重复跟旧单吗？

不会。`seen_trades` 表持久化已处理成交；仅 **未见过** 且在 `max_trade_age_hours` 内的成交会被处理。

### Q7：如何临时停止跟单？

任选其一：

- `config.yaml` → `enable_copy_trading: false`，重启
- 所有 Leader 设 `enabled: false`，重启
- 停止进程

### Q8：如何更换 Leader？

编辑 `config.yaml` 中 Leader 的 `address`/`username`，重启进程。无需删除数据库；旧 `seen_trades` 不影响新 Leader。

---

## 14. 安全须知

1. **专用钱包：** 跟单钱包与主资产隔离，Live 测试先用 ≤ $20。
2. **默认 Preview：** 未明确确认前保持 `preview_mode: true`。
3. **勿泄露私钥：** `.env` 不要提交 Git、不要发给他人、不要粘贴到公开 Issue。
4. **官方 npm：** 仅使用 `registry.npmjs.org` 安装依赖。
5. **警惕恶意仓库：** 不要使用来源不明的 Polymarket 跟单脚本（已知存在窃取私钥的 npm 包）。
6. **依赖审计：** 见 [`SECURITY.md`](SECURITY.md)；不要对 CLOB 客户端执行 `npm audit fix --force`。
7. **日志分享：** 分享日志前检查是否含 token 地址等你不想公开的信息。

---

## 15. 相关文档

| 文档 | 内容 |
|------|------|
| [README.md](../README.md) | 项目概览与快速开始 |
| [RUNBOOK.md](RUNBOOK.md) | 运维手册（英文） |
| [PREVIEW_CHECKLIST.md](PREVIEW_CHECKLIST.md) | 7 天 Preview 验收清单 |
| [SECURITY.md](SECURITY.md) | 安全与依赖说明 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构设计 |
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | 开发里程碑 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 |
| `config.preview.template.yaml` | 带注释的配置模板 |

---

**文档反馈：** 若发现说明与 v1.0.0 行为不符，请对照 `CHANGELOG.md` 或提交 Issue。
