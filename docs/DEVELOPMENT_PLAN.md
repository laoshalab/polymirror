# PolyMirror 开发规划

> 版本：v0.1 规划 · 2026-06-24  
> 状态：Scaffold 已就绪，进入 M1 实现阶段

---

## 1. 项目定位

### 1.1 是什么

**PolyMirror** — Polymarket **单平台、多 Leader** 镜像跟单引擎。

- 监听多个 Leader proxy 的 TRADE 活动
- 按 Leader 独立策略缩放仓位
- 统一风控、去重、冲突处理
- **Preview 默认**，实盘需显式开启

### 1.2 不是什么（v1.0 范围外）

| 不在 v1.0 | 说明 |
|-----------|------|
| 跨 venue 跟单 | Kalshi / Limitless 映射 → 见 [Future §8](#8-远期规划) |
| Web 交易平台 | 非 Polymarket 前端替代品 |
| 保证盈利 / AI 预测 | 不做营销性「胜率保证」 |
| 托管私钥 SaaS | 自托管 daemon，密钥仅本地 |

### 1.3 差异化（相对 GitHub 生态）

见 [DEEP_ANALYSIS.md](DEEP_ANALYSIS.md)。PolyMirror 核心差异：

1. **`@polymarket/clob-client-v2`** — 多数竞品仍用 V1 SDK  
2. **Preview-first + 供应链安全** — 官方 npm、无密钥外传逻辑  
3. **多 Leader 一等公民** — 配置、冲突、限额按 Leader 粒度  
4. **SQLite 单文件状态** — 无 MongoDB 运维负担  
5. **可测试** — 每里程碑附带单元/集成测试

---

## 2. 技术栈（锁定）

| 层 | 选型 | 理由 |
|----|------|------|
| 语言 | **TypeScript 5** | CLOB V2 SDK、迭代速度、生态参考多 |
| 运行时 | **Node.js ≥ 20** | ES2022、稳定 LTS |
| 配置 | `.env` + **`config.yaml`** | 密钥 vs 策略分离 |
| 校验 | **Zod** | 启动时 fail-fast |
| 持久化 | **better-sqlite3** | 同步、单文件、daemon 友好 |
| 链 / 签名 | `@ethersproject/wallet` | 与 CLOB SDK 一致 |
| 执行 | **`@polymarket/clob-client-v2`** | 2026 生产 CLOB |
| 数据 | Polymarket **Data API** HTTP | `/activity` 轮询（M1–M4） |
| 日志 | 结构化 console → 文件（M4+） | 先简单后扩展 |
| 测试 | **Node test runner** 或 Vitest（M2 引入） | 与 polycopy 对齐 |
| CI | GitHub Actions（M2） | lint + test |
| 容器 | Dockerfile（M5 可选） | 单二进制式部署 |

**禁止：**

- 非 `registry.npmjs.org` 的 npm 源  
- 向第三方发送 `privateKey` 的「验证/配置」调用  
- 复制 kppox 等已知恶意仓库的依赖树  

---

## 3. 版本路线图

```
v0.1.0  M1–M2   Preview 多 Leader 闭环（无实盘）
v0.2.0  M3      冲突 + 完整 SELL 路径 + 测试
v0.3.0  M4      CLOB V2 实盘 + Kill Switch
v0.4.0  M5      Tiered / Aggregation / Telegram
v1.0.0  M6      文档、Docker、7 天 Preview 验收、安全自检清单
v2.0.0  —       跨 venue（独立 matcher 子系统）
```

---

## 4. 里程碑详规

### M1 — 单 Leader Preview 闭环

**目标：** 端到端跑通「监听 →  sizing → 日志」，无实盘。

| 任务 | 文件/模块 | 状态 |
|------|-----------|------|
| Data API activity 拉取 | `monitor/data-api.ts` | ✅ |
| 单 Leader 轮询循环 | `engine/copy-cycle.ts` | ✅ |
| PERCENTAGE sizing | `engine/sizing.ts` | ✅ |
| seen 去重 + SQLite | `state/store.ts` | ✅ |
| Preview 不下单 | `executor/clob.ts` | ✅ stub |
| YAML + env 加载 | `config/load.ts` | ✅ |
| 过旧 activity 过滤 | `monitor/poll.ts` | ✅ |

**验收标准：**

- [ ] `preview_mode: true` 下运行 24h 无 crash  
- [ ] 同一笔 leader 成交只 log 一次  
- [ ] 配置缺 leader / 坏私钥时启动失败并给出明确错误  
- [ ] `npm run lint` 通过  

**交付物：** 可运行的 `npm run dev`

---

### M2 — 多 Leader + 全局风控 + 测试

**目标：** 3+ Leader 并行；全局 caps；自动化测试。

| 任务 | 说明 |
|------|------|
| 并行 poll（错峰 / Promise.all + rate limit） | `monitor/poll.ts` |
| 每 Leader `limits` / `filters` 生效 | `engine/sizing.ts`, 新 `engine/filters.ts` |
| 全局 `max_daily_volume_usd` 计数 | `state/store.ts` + `engine/risk.ts` |
| `max_open_markets` | `state/store.ts` |
| Vitest + 单元测试 | sizing、dedup、filter |
| GitHub Actions CI | `.github/workflows/ci.yml` |
| Leader 启用/禁用热读配置 | 可选：SIGHUP 重载 |

**验收标准：**

- [ ] 3 个 Leader 同时 poll，日志带 `leader.id`  
- [ ] 超过 `max_order_usd` 的 preview 日志显示 capped 原因  
- [ ] 测试覆盖率：sizing + dedup ≥ 80% 行覆盖  
- [ ] CI 绿  

---

### M3 — 冲突处理 + SELL 完整路径

**目标：** 多 Leader 反向不炸仓；SELL 安全。

| 任务 | 说明 |
|------|------|
| `conflict.mode` 实现 | 新 `engine/conflict.ts` |
| `priority_leader` 默认 | 见 `config.example.yaml` |
| SELL 持仓校验（已有）增强 | 链上 balance 可选校验 |
| BUY 30s 去重窗口 | `state/store.ts` |
| tick_size 预检 | `executor/clob.ts` 调 orderbook |
| 结构化 audit log 表 | SQLite `audit_log` |

**验收标准：**

- [ ] 两 Leader 同 token 反向：按配置 skip / priority 行为正确  
- [ ] 无持仓 SELL 信号：skip + audit，不报错退出  
- [ ] 重启后 `seen` 不重复跟 1h 内旧单  

**参考实现：** [Adialia1/Polybot](https://github.com/Adialia1/Polybot) conflict、TradeSEB balance

---

### M4 — CLOB V2 实盘 + Kill Switch

**目标：** 小仓真实下单；日亏损熔断。

| 任务 | 说明 |
|------|------|
| 集成 `@polymarket/clob-client-v2` | `executor/clob.ts` |
| API Key derive/create | 参考 kppox 逻辑但**无恶意依赖** |
| GTC 限价跟单（默认） | `global.execution.order_type` |
| FAK 可选 | 配置切换 |
| `preview_mode: false` 显式 + 二次确认 env | `REQUIRE_LIVE_CONFIRM=true` |
| Kill Switch：`daily_loss_cap_pct` | `engine/risk.ts` |
| 网络重试 | `retry_limit`, 指数退避 |
| 日 PnL 估算 | 简化：基于 copy 成交流水 |

**验收标准：**

- [ ] 测试网 / 极小仓（≤$5）10 笔 BUY 人工核对 token/side/size  
- [ ] Kill Switch 触发后停止一切下单直至次日 UTC 0 点  
- [ ] 私钥仅出现在 env，日志脱敏  

**迁移参考：** [Polymarket CLOB V2](https://docs.polymarket.com/v2-migration)

---

### M5 — 增强策略与通知

| 任务 | 优先级 |
|------|--------|
| FIXED / ADAPTIVE sizing | P1 |
| Tiered multipliers 解析 | P1 |
| Trade aggregation 窗口 | P2 |
| 滑点容忍 `slippage_tolerance` | P1 |
| Telegram 通知 | P2 |
| Health HTTP `/health` | P2 |
| 用户名 → proxy 解析 | P3 |

**参考：** polycopy `copyStrategy.ts`, `tradeExecutor.ts`

---

### M6 — v1.0 发布就绪

| 任务 | 说明 |
|------|------|
| README 中英 + 快速开始 | 含安全章节 |
| `docs/RUNBOOK.md` 运维手册 | 启动、排错、升级 |
| Dockerfile | 可选 multi-stage |
| Preview 7 天 checklist | 发布前必做 |
| `npm audit` 无 high/critical | 供应链 |
| CHANGELOG |  semver |

---

## 5. 模块实现清单

与 [ARCHITECTURE.md](ARCHITECTURE.md) 对应，标注规划状态。

| 模块 | 路径 | M1 | M2 | M3 | M4 | M5 |
|------|------|:--:|:--:|:--:|:--:|:--:|
| Config | `config/` | ✅ | 热重载 | — | live confirm | — |
| Leaders | `leaders/` | ✅ | ✅ | ✅ | ✅ | 解析用户名 |
| Monitor | `monitor/` | ✅ poll | 并行 | — | WS 可选 | — |
| Engine dedup | `engine/dedup.ts` | 内联 | 拆分 | BUY 窗口 | — | — |
| Engine sizing | `engine/sizing.ts` | ✅ | filters | — | balance | tiered |
| Engine conflict | `engine/conflict.ts` | — | — | ✅ | — | — |
| Engine risk | `engine/risk.ts` | — | 日限额 | — | kill | slippage |
| Engine cycle | `engine/copy-cycle.ts` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Executor | `executor/clob.ts` | stub | orderbook | tick | **V2 live** | FAK |
| State | `state/store.ts` | ✅ | 日计数 | audit | PnL | — |
| Notify | `notify/` | log | — | audit | Telegram | health |

### 5.1 待新建文件

```
src/engine/dedup.ts
src/engine/filters.ts
src/engine/conflict.ts
src/engine/risk.ts
src/executor/orderbook.ts
src/executor/auth.ts          # CLOB API key derive
src/notify/telegram.ts
tests/sizing.test.ts
tests/dedup.test.ts
tests/conflict.test.ts
.github/workflows/ci.yml
docs/RUNBOOK.md
```

---

## 6. 配置规范

### 6.1 文件职责

| 文件 | 内容 | 提交 git |
|------|------|----------|
| `.env` | `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_ADDRESS` | ❌ |
| `config.yaml` | leaders、风控、执行参数 | ❌（用 template） |
| `config.example.yaml` | 最小模板 | ✅ |
| `config.preview.template.yaml` | Preview 完整注释模板 | ✅ |
| `data/polymirror.db` | SQLite | ❌ |

### 6.2 Leader 配置 schema（摘要）

```yaml
leaders:
  - id: string              # 唯一别名
    address: "0x..."        # proxy 40 hex
    enabled: bool
    weight: number          # 预算权重（冲突/分配用）
    strategy:
      type: PERCENTAGE | FIXED | ADAPTIVE
      copy_size: number
      tiered_multipliers: string  # M5
    limits:
      max_order_usd: number
      max_position_usd: number
      max_daily_volume_usd: number
    filters:
      min_price / max_price: number
      sides: [BUY, SELL]
```

完整示例见 [`config.example.yaml`](../config.example.yaml)。

### 6.3 实盘安全门

```bash
# .env — 实盘需同时满足：
PREVIEW_MODE=false          # 或在 config.yaml: preview_mode: false
REQUIRE_LIVE_CONFIRM=true   # 启动时打印警告并等待 env 确认
POLYMARKET_PRIVATE_KEY=...
POLYMARKET_ADDRESS=...
```

---

## 7. 数据模型（SQLite）

### 7.1 现有表（M1）

```sql
seen_trades (key PRIMARY KEY, leader_id, created_at)
positions (leader_id, token_id, shares, PRIMARY KEY(leader_id, token_id))
```

### 7.2 M3+ 扩展

```sql
audit_log (
  id INTEGER PRIMARY KEY,
  ts INTEGER,
  leader_id TEXT,
  action TEXT,      -- DETECT | SKIP | COPY | ERROR
  token_id TEXT,
  side TEXT,
  size REAL,
  price REAL,
  reason TEXT,
  preview INTEGER
)

daily_stats (
  date TEXT PRIMARY KEY,
  volume_usd REAL,
  realized_pnl REAL,
  copy_count INTEGER
)
```

---

## 8. 远期规划（v2.0+）

**不在 v1.0 实现。** 独立设计文档待写 `docs/CROSS_VENUE.md`。

| 阶段 | 内容 |
|------|------|
| v2.0-alpha | PM Leader 监听 + PMXT/Predexon 市场映射 |
| v2.0-beta | Kalshi / Limitless adapter |
| v2.1 | 分 venue 风控与 Kill Switch |

见前期调研：跨平台需 **市场映射层**，不能复制 tokenId。

---

## 9. 测试策略

### 9.1 金字塔

```
        E2E Preview（手动 24h）
       /                        \
  集成测试（mock Data API + mock CLOB）
 /                                    \
单元测试（sizing, dedup, conflict, risk）
```

### 9.2 必测场景

| 场景 | 类型 | 里程碑 |
|------|------|--------|
| PERCENTAGE / FIXED / ADAPTIVE 计算 | 单元 | M2/M5 |
| max/min order cap | 单元 | M2 |
| tradeEventKey 去重 | 单元 | M1 |
| 两 Leader 反向冲突 | 单元 | M3 |
| SELL 无持仓 skip | 单元 | M3 |
| Preview 不调用 CLOB | 集成 | M1 |
| Live mock CLOB 下单参数 | 集成 | M4 |

### 9.3 禁止

- 在 CI 中使用真实私钥  
- 单元测试依赖 Polymarket 生产 API（用 fixture JSON）

---

## 10. 安全与合规 checklist

发布 v1.0 前逐项确认：

- [ ] 仅 `registry.npmjs.org` 依赖  
- [ ] `npm audit` 无 high+  
- [ ] 无 `privateKey` 网络传输代码  
- [ ] `.env` / `config.yaml` 在 `.gitignore`  
- [ ] README 含「专用小额钱包」警告  
- [ ] 默认 `preview_mode: true`  
- [ ] 实盘需 `REQUIRE_LIVE_CONFIRM`  
- [ ] 日志脱敏（key、api secret 不输出）  
- [ ] 不复制 kppox / 高 fork 异常仓库代码  

---

## 11. 开发工作流

### 11.1 本地

```bash
cd PolyMirror
cp .env.example .env
cp config.example.yaml config.yaml
npm install
npm run dev          # Preview
npm run lint
npm test             # M2+
```

### 11.2 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 可发布版本 |
| `feat/m2-parallel-poll` | 功能分支 |
| `fix/sell-balance` | 修复 |

### 11.3 PR 检查项

1. `npm run lint`  
2. `npm test`  
3. 涉及实盘：必须默认 Preview 安全  
4. 新 env 项：更新 `.env.example` + 本文档 §6  

---

## 12. 排期建议（单人兼职参考）

| 里程碑 | 预估工时 | 累计 |
|--------|----------|------|
| M1 收尾 + 24h 试跑 | 4h | 4h |
| M2 多 Leader + CI | 16h | 20h |
| M3 冲突 + SELL | 12h | 32h |
| M4 V2 实盘 + Kill | 24h | 56h |
| M5 增强 | 20h | 76h |
| M6 发布 | 8h | **84h** |

约 **10–12 个兼职周** 可达 v1.0。跨 venue v2 另计。

---

## 13. 文档索引

| 文档 | 用途 |
|------|------|
| [README.md](../README.md) | 项目入口 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构与模块 |
| [FEATURES_SURVEY.md](FEATURES_SURVEY.md) | GitHub 功能清单 |
| [DEEP_ANALYSIS.md](DEEP_ANALYSIS.md) | 竞品完善度分析 |
| **DEVELOPMENT_PLAN.md** | 本文 — 开发规划 |
| `RUNBOOK.md` | 运维手册 |
| `USER_GUIDE.md` | **使用说明书** |
| `PREVIEW_CHECKLIST.md` | Preview 7 天验收 |
| `CROSS_VENUE.md` | v2 跨平台（待写） |

---

## 14. 当前进度快照

| 项 | 状态 |
|----|------|
| 项目 scaffold | ✅ |
| Git 初始化 | ✅ |
| TypeScript lint | ✅ |
| M1 核心 loop | ✅ |
| M2 多 Leader + 风控 + 测试 + CI | ✅ |
| M3 冲突 / SELL / audit log | ✅ |
| M5 增强 + 通知 | ✅ |
| M6 v1.0 release | ✅ **v1.0.0** |
| CHANGELOG | ✅ |
| Dockerfile + compose | ✅ |
| Preview 7 天 checklist | ✅ `docs/PREVIEW_CHECKLIST.md` |
| SECURITY.md | ✅ |
| npm audit (critical) | ✅ CI 通过；high 为 CLOB 传递依赖，见 SECURITY.md |

**下一步建议：** 按 `docs/PREVIEW_CHECKLIST.md` 完成 7 天 preview → 极小仓 live 验证 → `git tag v1.0.0`。
