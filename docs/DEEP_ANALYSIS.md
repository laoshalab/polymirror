# Polymarket 跟单平台深度调研 — 功能完善度分析

> 二次深入调研 · 2026-06-24  
> 方法：GitHub 检索（469 仓库）+ Top 11 项目元数据/目录树/源码抽样 + 3 仓库完整浅克隆

---

## 1.  executive 结论

**GitHub 上不存在「功能完善且可放心用于生产」的单一开源 Polymarket 跟单平台。**

原因不是「缺功能」，而是三类系统性缺口叠加：

| 缺口类型 | 说明 |
|----------|------|
| **供应链安全** | 大量高 fork 仓库含恶意 npm 依赖或 SEO 农场 |
| **CLOB V2 滞后** | 多数项目仍用旧 `@polymarket/clob-client`（V1），2026-04 后生产环境需 [V2 SDK](https://docs.polymarket.com/v2-migration) |
| **宣传 > 实现** | README 功能列表常多于可运行代码（实盘 stub、无测试、无 CI） |

**相对最完善（仍需谨慎审计）的三档：**

| 档位 | 项目 | 完善度（10 分制） | 主要短板 |
|------|------|-------------------|----------|
| A | [neosun100/polycopy](https://github.com/neosun100/polycopy) | **8.0** | 旧 CLOB SDK；最后 push 2026-03 |
| A | [shmlkv/polymarket-copy-trading-bot](https://github.com/shmlkv/polymarket-copy-trading-bot) | **7.5** | 依赖 MongoDB；旧 SDK；Web 重 |
| A | [Adialia1/Polybot](https://github.com/Adialia1/Polybot) | **7.5** | Stars 低但功能全；需自行验证 |
| B | [TradeSEB/polymarket-copytrading-bot](https://github.com/TradeSEB/polymarket-copytrading-bot) | **6.5** | 无测试/CI；旧 SDK；单 target |
| B | [duolaAmengweb3/duola](https://github.com/duolaAmengweb3/duola) | **6.5** | 偏 CLI 工作流；非一体化 bot |
| B | [taetaehoho/polymarket-copytrader](https://github.com/taetaehoho/polymarket-copytrader) | **6.5** | Rust 执行强；无 UI；2025-12 停更 |
| C | [gnanam1990/polymarket-copy-bot](https://github.com/gnanam1990/polymarket-copy-bot) | **5.0** | **实盘未实现**（`Live trading not yet implemented`） |
| C | [Joshbazz/polymarket_copy_trader](https://github.com/Joshbazz/polymarket_copy_trader) | **4.5** | 2024-09 停更；结构古老 |
| ⚠️ | [kppox/polymarket-copy-bot](https://github.com/kppox/polymarket-copy-bot) | **N/A** | **恶意依赖，禁止运行** |

**PolyMirror 定位：** 在 A 档功能模型基础上，以 **V2 SDK + 安全默认 + Preview-first** 补齐生态共性短板。

---

## 2. 生态规模与质量分布

### 2.1 数量

- `polymarket copy` 关键词：**469** 仓库  
- Top 80 抽样语言：**Python 38** · TypeScript 18 · 无语言 15 · Rust 5  

### 2.2 质量信号

| 信号 | 数量（Top 80） | 含义 |
|------|----------------|------|
| Forks > 50 且 Stars < 100 | **4** | 疑似 fork 农场 / 钓鱼 |
| 无 primaryLanguage | **15** | 空壳或仅 README |
| 6 个月内无 push | 多数 Top 项目 | 维护停滞 |
| 含 `__tests__` / CI | polycopy, shmlkv, Polybot, duola | 少数有工程化 |

**Stars 不能代表完善度。** kppox（242★）为已知恶意项目；Obsidian-Trades（20★ / 455F）fork 异常。

---

## 3. 「完善跟单平台」评估维度

以下 **12 维** 构成满分基准（PolyMirror 目标模型）：

| # | 维度 | 权重 | 说明 |
|---|------|------|------|
| D1 | 多 Leader | 高 | 同时跟多个 proxy |
| D2 | 监听实时性 | 高 | WS 或 ≤5s 轮询 |
| D3 | Sizing 策略 | 高 | % / 固定 / 自适应 / 分层 |
| D4 | 风控 | 高 | Preview、Kill Switch、上下限 |
| D5 | 执行完整性 | **关键** | BUY+SELL、tick、余额校验 |
| D6 | 去重与状态 | 高 | 持久化、重启安全 |
| D7 | 冲突处理 | 中 | 多 Leader 反向 |
| D8 | 退出策略 | 中 | SL/TP/Trailing/时间退出 |
| D9 | 结算运维 | 中 | redeem、allowance、对账 |
| D10 | 可观测性 | 中 | 日志、Telegram、Dashboard |
| D11 | 工程化 | 中 | 测试、CI、Docker、文档 |
| D12 | **生产就绪** | **关键** | CLOB **V2** SDK、无恶意依赖 |

---

## 4. 分项评分矩阵（Top 11）

分数：0 缺失 · 1 部分 · 2 完善 · **N/A** 不可用

| 项目 | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | D11 | D12 | **总分/24** |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:---:|:---:|:-----------:|
| polycopy | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 0 | 2 | 2 | 2 | **0** | **18** |
| shmlkv | 2 | 2 | 2 | 1 | 2 | 2 | 1 | 0 | 2 | 2 | 2 | **0** | **18** |
| Polybot | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 1 | **20** |
| TradeSEB | 0 | 2 | 1 | 1 | 2 | 2 | 0 | 0 | 2 | 1 | 0 | **0** | **11** |
| duola | 2 | 1 | 1 | 1 | 2 | 2 | 0 | 0 | 0 | 1 | 2 | 1 | **13** |
| Predict-Org | 2 | 2 | 1 | 0 | 2 | 1 | 0 | 1 | 0 | 1 | 0 | 1 | **11** |
| taetaehoho | 1 | 2 | 1 | 1 | 2 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | **9** |
| gnanam1990 | 2 | 1 | 1 | 1 | **0** | 1 | 0 | 0 | 0 | 2 | 0 | 0 | **8** |
| Joshbazz | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **6** |
| realfishsam | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| kppox | — | — | — | — | — | — | — | — | — | — | — | **N/A** | **禁止** |

> D12=0：仍使用 `@polymarket/clob-client` V1  lineage（v4/v5），未迁移 `@polymarket/clob-client-v2`。  
> D12=1：使用 clob-client v5.x（可能部分兼容，需实测 V2 环境）。

---

## 5. 逐项目深度分析

### 5.1 neosun100/polycopy — 功能最全的开源之一

**强项（源码证实）：**

- 多 Leader、`COPY_STRATEGY`（PERCENTAGE/FIXED/ADAPTIVE）
- Tiered multipliers、Trade aggregation（窗口合并小单）
- Kill Switch（`DAILY_LOSS_CAP_PCT`）、Preview mode
- Telegram、Web UI、Swagger REST、MCP Server
- NeDB 本地存储、Docker、**40 项单元测试**
- 大量运维脚本（redeem、allowance、扫描 leader、模拟 profitability）

**短板：**

- `@polymarket/clob-client` **^4.14.0**（V1，需迁移 V2）
- 最后 push **2026-03-01**，CLOB V2 切主网（2026-04-28）后状态未验证
- 源自恶意 fork 重写版——代码已审计声明，仍建议自行 review

**完善度：功能设计 8/10，生产就绪 5/10**

---

### 5.2 shmlkv/polymarket-copy-trading-bot — 产品化程度高

**强项：**

- Next.js Web Dashboard（Trader 分析、My Trades、Settings）
- MongoDB 持久化、Docker Compose
- Multi-trader、aggregation、tiered multipliers、auto-resolver
- GitHub CI、Vitest 测试

**短板：**

- 运维复杂（MongoDB + Web + Bot 三组件）
- 旧 CLOB SDK；最后 push **2026-02-14**
- 无 Telegram / Kill Switch 在 env 中不如 polycopy 显式

**完善度：功能 7.5/10，工程 8/10，生产 5/10**

---

### 5.3 Adialia1/Polybot — 风控维度最完整

**强项（`.env.example` 115 行）：**

- 多 wallet + allocation 权重
- DRY_RUN、COPY_SELLS、CONFLICT_STRATEGY（first/skip/majority）
- SL / TP / Trailing / DAILY_LOSS / MAX_HOLD_TIME
- 概率、价差、关键词黑白名单
- Telegram + Dashboard + Health Check + Config hot-reload
- CI + CodeQL、`@polymarket/clob-client` 5.7.0
- Position reconciliation 测试脚本

**短板：**

- Stars 仅 2，社区验证少
- 文档体量大，真实长期运行案例少
- 仍未用官方 `clob-client-v2` 包名

**完善度：风控设计 9/10，社区信任 4/10**

---

### 5.4 TradeSEB/polymarket-copytrading-bot — 实时执行向

**强项：**

- WebSocket（`@polymarket/real-time-data-client`）+ 重连
- FAK 订单、SELL 余额校验、tx 去重
- **完整 auto-redeem 模块**（链上 CTF balance 验证）
- 代码量适中（28 文件），易读

**短板：**

- **单 TARGET_WALLET**，无多 Leader 配置
- 无测试（`"test": "Error: no test specified"`）
- 旧 SDK v4.22.8
- 无 Preview / Kill Switch / Web UI

**完善度：执行+赎回 7/10，平台化 4/10**

---

### 5.5 duolaAmengweb3/duola — CLI / 工作流向

**强项：**

- `leader add/list/inspect/remove`
- `sync` 历史、`backtest`、`doctor` 诊断
- `follow` + `autopilot onboard/start/stop`（后台进程）
- Vitest 测试、SQLite 本地库
- `@polymarket/clob-client` ^5.3.0

**短板：**

- 非「开箱即用 bot」，更像开发者工具链
- 无 Web Dashboard / Telegram
- 多 Leader 有，但 conflict / kill switch 弱

**完善度：研发工作流 8/10，小白友好 5/10**

---

### 5.6 taetaehoho/polymarket-copytrader — Rust 低延迟

**强项：**

- WebSocket 监听、FAK 失败 **多级重提交**（加价追单）
- **Circuit breaker**（大单 + 深度不足暂停）
- Tier 化 whale size 处理、neg_risk
- Rust 测试覆盖 resubmit 逻辑

**短板：**

- 无多 Leader 管理 UI、无 Dashboard
- 配置偏硬核（`.env` + 多 RPC key）
- 2025-12-22 后无更新；Rust 非官方 SDK 自封装

**完善度：执行引擎 8/10，产品完整度 4/10**

---

### 5.7 gnanam1990/polymarket-copy-bot — 过滤强、实盘弱

**强项：**

- 多 wallet、Flask Dashboard、SSE live feed
- 价格区间、ROI 门槛、whale exit 告警
- Paper 模式含 FOK 拒绝模拟
- 2026-06 仍活跃 push

**致命短板（源码）：**

```python
# copier.py
async def _live_fill(...):
    # TODO: Implement py-clob-client FOK order
    log.warning("Live trading not yet implemented")
```

**完善度：监控+纸面 7/10，实盘 0/10 — README 夸大**

---

### 5.8 Joshbazz/polymarket_copy_trader — 早期多进程脚本

- 三进程：monitor + tailer + risk_manager
- 2024-09 停更；含 `.pyc` 提交
- 无现代 CLOB 客户端结构、无测试

**完善度：3/10 — 历史参考 only**

---

### 5.9 kppox/polymarket-copy-bot — 禁止列表

- 242★ / 4968F，SEO README
- `registrynpmjs.to` 恶意包、`enquirer.verifyConfiguration(privateKey)`
- 功能列表看起来完整，**实为钓鱼**

---

### 5.10 HubbleVision/polyhub-skills — 非传统 bot

- 81★，AI Agent / MCP skills 控制跟单账户
- 跨 Telegram、WeChat、Claude Code
- 偏「平台集成」而非自托管 copy engine

---

## 6. 共性缺失（整个 GitHub 生态）

以下功能在「完善平台」中应有，但 **>70% 仓库缺失或仅 README 提及**：

| 缺失功能 | 覆盖率估计 | 影响 |
|----------|------------|------|
| **CLOB V2 SDK** | <5% | 2026 生产可能无法下单 |
| 多 Leader + 冲突策略 | ~25% | 跟多人必踩坑 |
| Kill Switch / 日亏损上限 | ~15% | 无资金保护 |
| Preview / Dry-run 默认 | ~30% | 易误触实盘 |
| SELL 持仓校验 | ~40% | oversell 风险 |
| 单元/集成测试 | ~10% | 改配置即炸 |
| 安全依赖审计 | ~5% | 私钥窃取 |
| Position reconciliation | ~10% | 重启后状态漂移 |
| 自动 redeem 已结算 | ~15% | 资金锁死 |
| SL/TP/Trailing | ~5% | 仅 Polybot 等个别 |
| 回测与实盘同源逻辑 | ~5% | duola/huahuajhu 分离 |

---

## 7. 功能完善度分层模型

```
┌─────────────────────────────────────────────────────────┐
│ L4  Production Platform     ← 无开源项目完全达到         │
│     V2 SDK + 测试 + CI + 安全 + 多Leader + 风控 + UI    │
├─────────────────────────────────────────────────────────┤
│ L3  Advanced Bot              ← polycopy, shmlkv, Polybot│
│     多Leader + sizing + 部分风控 + UI/脚本              │
├─────────────────────────────────────────────────────────┤
│ L2  Working Executor          ← TradeSEB, duola, Predict│
│     能下单但缺平台化与风控                               │
├─────────────────────────────────────────────────────────┤
│ L1  Demo / Paper / Script     ← gnanam1990, huahuajhu   │
│     监控或模拟为主                                       │
├─────────────────────────────────────────────────────────┤
│ L0  Scam / Empty              ← kppox, 高fork SEO 仓库  │
└─────────────────────────────────────────────────────────┘
```

**结论：开源生态集中在 L2–L3，L4 需自建（PolyMirror 目标）。**

---

## 8. PolyMirror 应对策略

基于本次深入调研，PolyMirror 相对竞品的**差异化优先级**：

| 优先级 | 能力 | 依据 |
|--------|------|------|
| P0 | `@polymarket/clob-client-v2` | 生态最大共性短板 |
| P0 | Preview 默认 + 官方 npm | 安全 |
| P1 | 多 Leader + conflict + Kill Switch | polycopy/Polybot 有，多数无 |
| P1 | SQLite 状态 + SELL 校验 | 已有 scaffold |
| P2 | Tiered + aggregation | polycopy 验证过的设计 |
| P2 | Telegram + health | 运维 |
| P3 | Web Dashboard | shmlkv 参考，非首版 |
| P3 | redeem / reconcile | TradeSEB/Polybot 参考 |
| P4 | FAK 重试 + circuit breaker | taetaehoho 参考 |

**不建议照搬：**

- kppox 任何依赖或私钥处理
- gnanam1990 的「Live」宣传（未实现）
- MongoDB 重栈（shmlkv）— PolyMirror 已选 SQLite

---

## 9. 调研方法说明

1. `gh search repos "polymarket copy" --limit 80`
2. `gh api repos/{owner}/{repo}/git/trees/HEAD?recursive=1` 目录特征扫描
3. 浅克隆：polycopy、TradeSEB、gnanam1990（2026-06-24）
4. 复用 `/tmp/pm-research` 内 10 仓库的 `.env.example` 与源码 grep
5. 对照 [Polymarket CLOB V2 Migration](https://docs.polymarket.com/v2-migration)

---

## 10. 相关文档

- [功能清单（第一次调研）](FEATURES_SURVEY.md)
- [PolyMirror 架构](ARCHITECTURE.md)

---

## 11. 最终判断

| 问题 | 答案 |
|------|------|
| GitHub 上有完善跟单平台吗？ | **没有开箱即用的 L4 开源产品** |
| 哪个最接近？ | **polycopy / Polybot / shmlkv**（功能），**TradeSEB**（赎回+WS） |
| 最大共同问题？ | **V2 SDK 滞后 + 安全 + 测试缺失** |
| README 可信吗？ | **不可全信** — gnanam1990 等存在「宣传 Live、代码 TODO」 |
| PolyMirror 应做什么？ | **L3→L4**：V2 + 安全 + 多 Leader 风控，不重复 scam 生态 |
