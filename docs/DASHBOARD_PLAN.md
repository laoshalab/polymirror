# PolyMirror Dashboard 前端规划

> 版本：草案 v0.1 · 2026-06-24  
> 状态：规划阶段（v1.0 引擎已就绪，Dashboard 为 v1.1+ 子系统）  
> 关联：[ARCHITECTURE.md](ARCHITECTURE.md) · [USER_GUIDE.md](USER_GUIDE.md) · [FEATURES_SURVEY.md](FEATURES_SURVEY.md)

---

## 1. 定位与原则

### 1.1 Dashboard 是什么

PolyMirror Dashboard 是 **自托管跟单引擎的本地管理控制台**，用于：

- 可视化运行状态、持仓、审计日志
- 通过表单管理 Leader / 策略 / 风控（替代手改 `config.yaml`）
- 安全地切换 Preview / Live、确认 Kill Switch

### 1.2 Dashboard 不是什么

| 不做 | 原因 |
|------|------|
| Polymarket 交易前端 | 下单仍走 CLOB；Dashboard 只管理跟单引擎 |
| 托管私钥 SaaS | 私钥只在用户机器；Dashboard 不收集、不上传 |
| 多租户云端登录 | 单实例、单用户/小团队；本地或 VPS 自托管 |

### 1.3 设计原则

1. **Preview-first UI** — 默认展示 Preview 状态，Live 切换需二次确认
2. **只读优先** — 第一版以观测为主，写操作逐步开放
3. **与 daemon 解耦** — 前端独立构建；通过 HTTP API 与引擎通信
4. **安全默认** — 绑定 localhost、Session/API Token、敏感字段永不回显
5. **配置即代码** — Dashboard 修改最终落盘 `config.yaml`（或 API 写回），daemon 可 SIGHUP 重载

---

## 2. 用户与场景

| 角色 | 典型场景 |
|------|----------|
| 个人交易者 | 添加 Leader、看跟单日志、Preview 7 天后开 Live |
| 运维 | 看 `/health`、Kill Switch、pending GTC、wallet drift |
| 开发者 | 调试 SKIP 原因、审计日志、API 集成 |

---

## 3. 技术栈建议

### 3.1 推荐方案（与主仓库一致）

```
PolyMirror/
├── src/              # 现有 daemon（不变）
├── dashboard/        # 新：前端 SPA
│   ├── package.json
│   └── src/
└── src/api/          # 新：Dashboard REST + SSE（daemon 内或独立进程）
```

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | **React 19** + **Vite** | 与 TS 生态一致、构建快 |
| 路由 | **React Router** | 多页面清晰 |
| UI | **Tailwind CSS** + **shadcn/ui** | 快速做出专业控制台 |
| 图表 | **Recharts** 或 **ECharts** | PnL / 成交量曲线 |
| 数据 | **TanStack Query** | 轮询 + 缓存 `/health`、audit |
| 实时 | **SSE**（Server-Sent Events） | 审计流、成交流（比 WS 简单） |
| API | **Express** 或扩展现有 `node:http` | 与 daemon 同进程或 sidecar |

**备选：** Next.js 仅当需要 SSR/SEO 时；跟单控制台 **无需 SEO**，Vite SPA 更轻。

### 3.2 部署形态

| 模式 | 说明 |
|------|------|
| **A. 内嵌静态** | `dashboard/` build → `dist/dashboard/`，daemon 在 `8080` 同端口提供静态文件 + `/api/*` |
| **B. 独立端口** | 前端 `3000`，API `8081`，开发时用 Vite proxy |
| **C. Docker 双阶段** | 单镜像含 daemon + 静态 Dashboard |

推荐 **A**（单端口，运维简单）。

---

## 4. 信息架构（站点地图）

```
/login                    # 本地密码 / API Token（可选关闭）
/
├── /overview             # 总览（默认首页）
├── /leaders              # Leader 列表
│   ├── /leaders/new      # 添加 Leader（地址 / 用户名）
│   └── /leaders/:id      # Leader 详情 + 策略编辑
├── /positions            # 持仓（按 Leader / Token）
├── /activity             # 跟单活动（audit_log 流）
├── /orders               # Pending GTC + 近期订单
├── /risk                 # 风控 / Kill Switch / 日限额
├── /settings             # 全局配置、Preview/Live、通知
└── /logs                 # 运行日志 tail（可选 v1.2）
```

---

## 5. 页面详规

### 5.1 登录页 `/login`

**目的：** 防止 Dashboard 暴露到 LAN/公网时被未授权访问。

| 元素 | 说明 |
|------|------|
| 密码 / Token 输入 | 首次启动生成 `DASHBOARD_TOKEN` 写入 `.env` |
| 「仅本机访问」提示 | 说明 `HEALTH_BIND=127.0.0.1` |
| 记住会话 | HttpOnly Cookie，24h |

**v1.1 可简化：** 仅校验 Header `Authorization: Bearer <token>`，无用户体系。

---

### 5.2 总览 `/overview`

**核心 KPI 卡片：**

| 卡片 | 数据源 |
|------|--------|
| 运行状态 | `GET /api/status` ← 现有 `healthSnapshot` |
| Preview / Live | `previewMode` |
| Kill Switch | `killSwitchActive` |
| 今日跟单笔数 | `daily_stats.copy_count` |
| 今日成交额 | `daily_stats.volume_usd` |
| 今日已实现 PnL | `daily_stats.realized_pnl` |
| Pending GTC | `pendingOrders` |
| 上次轮询 | `lastPollAt` + `lastPoll` |

**图表（v1.2）：**

- 24h 跟单量柱状图（audit_log 聚合）
- Leader 贡献占比饼图

**告警条：**

- `walletDrifts` 非空 → 黄色横幅
- `lastError` → 红色横幅
- Kill Switch 激活 → 全页顶栏红色

```
┌─────────────────────────────────────────────────────────────┐
│  PolyMirror   [Preview]   Kill Switch: OFF    uptime 2h 15m │
├─────────────────────────────────────────────────────────────┤
│ ⚠ wallet drift: tok-abc wallet=12 tracked=10                │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ 今日跟单  │ 今日成交额 │ 今日 PnL  │ Pending  │ 启用 Leaders  │
│    12    │  $186.40 │  +$4.20  │    2     │      3         │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│ 最近活动（实时 SSE）                                          │
│ 18:01 COPY  whale_a BUY 10 @ 0.52  [PREVIEW]                │
│ 18:01 SKIP  whale_b  slippage reference unavailable         │
└─────────────────────────────────────────────────────────────┘
```

---

### 5.3 Leader 管理 `/leaders`

**列表页：**

| 列 | 说明 |
|----|------|
| ID | `leader.id` |
| 地址 / 用户名 | 缩略 `0xabc…123` 或 `@handle` |
| 启用 | Toggle（写 API → 更新 yaml） |
| 策略 | PERCENTAGE 10% 等摘要 |
| 今日成交额 | `leader_daily_stats` |
| 权重 | `weight` |

**添加 Leader `/leaders/new`（解决当前 YAML 占位符痛点）：**

```
┌─ 添加 Leader ─────────────────────────────────┐
│ 方式：  (•) Proxy 地址   ( ) Polymarket 用户名 │
│                                               │
│ 地址： [ 0x________________________________ ] │
│        或                                     │
│ 用户名：[ trader-handle                    ] │
│                                               │
│ Leader ID：[ whale_a                       ] │
│ 策略类型：[ PERCENTAGE ▼ ]  跟单比例：[ 10 ] % │
│ [高级：limits / filters ▼]                    │
│                                               │
│        [ 验证地址 ]  [ 保存并启用 ]            │
└───────────────────────────────────────────────┘
```

**「验证地址」：** 调用 `GET /api/leaders/validate?address=0x…` → 请求 Data API 是否有 TRADE。

**详情页 `/leaders/:id`：**

- 策略表单（type、copy_size、tiered、limits、filters）
- 该 Leader 近期 audit 记录
- 该 Leader 持仓表

---

### 5.4 持仓 `/positions`

| 列 | 数据源 |
|----|--------|
| Token | `token_id` 缩略 + 跳转 Polymarket（若缓存 market slug） |
| Leader | `leader_id` |
| 份额 | `positions.shares` |
| 均价 | `avg_entry_price` |
| 估算市值 | shares × 最近价（CLOB midpoint，可选） |
| 链上余额 | CLOB balance（Live + sync 开启时） |
| Drift | wallet vs sum(tracked) |

**操作（v1.2+）：** 手动「同步本地持仓」按钮（只读告警，不自动改账）。

---

### 5.5 活动流 `/activity`

**audit_log 表格 + SSE 实时追加：**

| 列 | 说明 |
|----|------|
| 时间 | `ts` |
| Leader | `leader_id` |
| 动作 | DETECT / SKIP / COPY / ERROR |
| 方向 | BUY / SELL |
| 数量 / 价格 | size, price |
| 原因 | `reason`（SKIP 可展开） |
| Preview | 徽章 |

**筛选：** Leader、动作、时间范围、仅 Live/Preview。

---

### 5.6 订单 `/orders`

**Pending GTC 表（`pending_orders`）：**

| 列 | 说明 |
|----|------|
| Order ID | CLOB id |
| Leader / Token / Side | |
| 已成交 / 总量 | filled / size |
| 挂单时长 | now - created_at |
| 状态 | 轮询 CLOB |

**操作（v1.2）：** 「取消挂单」→ `POST /api/orders/:id/cancel`

---

### 5.7 风控 `/risk`

| 区块 | 内容 |
|------|------|
| Kill Switch | 状态、触发原因、今日 PnL vs 上限、**手动重置（需确认）** |
| 日限额 | 全局 / 每 Leader 进度条 |
| 最大市场数 | 当前 / max |
| Token 集中度 | 各 token 敞口 vs `max_position_per_token_usd` |
| Preview 清单 | 链到 PREVIEW_CHECKLIST 完成度（手动勾选 v1.1） |

**Live 切换向导（重要）：**

```
Step 1: Preview 运行 ≥ 7 天  [=====>    ] 5/7
Step 2: 确认专用小额钱包      [✓]
Step 3: 设置 POLYMIRROR_LIVE_CONFIRM  [查看说明]
Step 4: [ 我了解风险，切换 Live ]  （二次弹窗 + 输入 CONFIRM）
```

---

### 5.8 设置 `/settings`

| Tab | 内容 |
|-----|------|
| 全局 | poll_interval、aggregation、order_type、health_port |
| 风控 | 全局 risk 块（表单化 yaml `global.risk`） |
| 冲突 | conflict mode、priority 拖拽排序 |
| 通知 | Telegram 开关（token 仅 .env，UI 只显示是否已配置） |
| 钱包 | **只显示** proxy 地址前后缀，私钥永不展示 |
| 危险区 | 清空 preview.db、导出 config、重启 daemon |

---

## 6. 后端 API 规划（需新建）

当前仅有只读 `GET /health`。Dashboard 需要扩展 **`src/api/`** 模块：

### 6.1 只读 API（M7.1 优先）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 等同 /health + 版本号 |
| GET | `/api/leaders` | 解析 config.yaml + 运行时 resolved 地址 |
| GET | `/api/leaders/validate` | 校验地址/用户名 |
| GET | `/api/positions` | SQLite positions |
| GET | `/api/audit` | 分页 audit_log `?leader=&action=&limit=&offset=` |
| GET | `/api/stats/daily` | daily_stats + leader_daily_stats |
| GET | `/api/orders/pending` | pending_orders + CLOB 状态 |
| GET | `/api/events` | **SSE** 推送新 audit / poll 完成 |

### 6.2 写入 API（M7.2，需鉴权 + 审计）

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/api/leaders/:id` | 更新单个 Leader → 写 config.yaml |
| POST | `/api/leaders` | 新增 Leader |
| PATCH | `/api/leaders/:id/enabled` | 启用/禁用 |
| PUT | `/api/settings/global` | 更新 global 块 |
| POST | `/api/mode/preview` | 切 Preview（写 yaml + 提示重启） |
| POST | `/api/mode/live` | 切 Live（校验 LIVE_CONFIRM env） |
| POST | `/api/kill-switch/reset` | 手动重置 Kill Switch（可选） |
| POST | `/api/orders/:id/cancel` | 取消 pending GTC |
| POST | `/api/config/reload` | SIGHUP 或内部重载 config |

### 6.3 认证

```bash
# .env
DASHBOARD_ENABLED=true
DASHBOARD_TOKEN=随机32字节hex
DASHBOARD_BIND=127.0.0.1
DASHBOARD_PORT=8080   # 与 health 合并或 health 升为 /api/status
```

所有 `/api/*`（除 `/api/status` 可选公开）校验 `Authorization: Bearer`.

---

## 7. 数据流架构

```
┌─────────────┐     REST/SSE      ┌──────────────────┐
│  Dashboard  │ ◄──────────────► │  API Layer       │
│  (React)    │                   │  src/api/        │
└─────────────┘                   └────────┬─────────┘
                                           │
                    read/write             │
                                           ▼
                                  ┌──────────────────┐
                                  │  copy-cycle      │
                                  │  StateStore      │
                                  │  config.yaml     │
                                  └──────────────────┘
```

**配置写入策略：**

1. API 收到 PUT → 校验 Zod → 备份 `config.yaml.bak` → 原子写入
2. 通知 daemon `reloadConfig()` 或提示用户重启
3. 禁止通过 API 写 `.env` 私钥（仅提示用户本地编辑）

---

## 8. 版本路线图

### M7.1 — 只读 Dashboard（2–3 周）

- [ ] `src/api/` 只读端点
- [ ] Dashboard：Overview + Activity + Leaders 列表（只读）
- [ ] 登录 Token
- [ ] Docker 内嵌静态资源

**验收：** 不编辑 yaml 即可查看运行状态与 audit。

### M7.2 — 配置表单（2–3 周）

- [ ] Leader 添加/编辑/启用（写 yaml）
- [ ] 地址/用户名验证 API
- [ ] Settings 全局 risk 表单
- [ ] 友好错误（替代 Zod JSON）

**验收：** 用户可通过 UI 完成首次 Leader 配置并 `npm run dev`。

### M7.3 — 风控与订单（1–2 周）

- [ ] Risk 页、Kill Switch 展示
- [ ] Pending orders 页
- [ ] Positions + wallet drift
- [ ] Live 切换向导

### M7.4 — 实时与 polish（1–2 周）

- [ ] SSE 活动流
- [ ] 图表（日成交量、PnL）
- [ ] 深色模式、移动端基础适配
- [ ] i18n（中/英）

---

## 9. 安全清单

| 项 | 要求 |
|----|------|
| 私钥 | 永不出现在 API 响应与前端 |
| Dashboard Token | 足够长、仅 .env、可轮换 |
| 默认绑定 | `127.0.0.1`；反代需额外 auth |
| CSRF | 同源 SPA + Bearer Token |
| Live 切换 | 双确认 + 审计日志 |
| config 写入 | 备份 + Zod 校验 + 文件锁 |

---

## 10. 与现有文档关系

| 文档 | Dashboard 如何复用 |
|------|-------------------|
| USER_GUIDE §4 | Settings / Leaders 表单字段一一对应 |
| USER_GUIDE §5 | Leader 添加向导逻辑 |
| PREVIEW_CHECKLIST | Risk 页 Live 向导 |
| RUNBOOK | Settings 危险区 + 运维提示 |

---

## 11. 下一步行动

1. **确认范围：** 是否先做 M7.1 只读版？
2. **创建目录：** `dashboard/` + `src/api/`
3. **扩展 health server** 或独立 Express 挂载 `/api` 与静态文件
4. **原型页：** `/overview` + `/leaders/new`（最高用户痛点）

---

## 附录 A：竞品 UI 参考

| 项目 | 可借鉴 |
|------|--------|
| [shmlkv/polymarket-copy-trading-bot](https://github.com/shmlkv/polymarket-copy-trading-bot) | Leader 输入、持仓表 |
| [gnanam1990/PolymarketCopyTradingBOT](https://github.com/gnanam1990/PolymarketCopyTradingBOT) | Profile URL 添加、SSE |
| [Adialia1/Polybot](https://github.com/Adialia1/Polybot) | Kill Switch、Dashboard 布局 |

## 附录 B：页面路由一览

| 路由 | 优先级 | 只读/可写 |
|------|--------|-----------|
| `/login` | P0 | — |
| `/overview` | P0 | 只读 |
| `/leaders` | P0 | → 可写 M7.2 |
| `/leaders/new` | P0 | 可写 |
| `/activity` | P0 | 只读 |
| `/positions` | P1 | 只读 |
| `/orders` | P1 | 只读 → 取消 M7.3 |
| `/risk` | P1 | 只读 → 重置 M7.3 |
| `/settings` | P2 | 可写 |
| `/logs` | P3 | 只读 |
