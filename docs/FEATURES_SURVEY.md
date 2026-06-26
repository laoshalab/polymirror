# Polymarket 跟单软件功能调研

> GitHub 开源 Polymarket copy-trading bot 功能提取与 PolyMirror 采纳建议  
> 调研日期：2026-06-24  
> 检索关键词：`polymarket copy`、`polymarket copy trading`、`polymarket copytrading`

---

## 1. 调研范围与方法

### 1.1 GitHub 规模（检索快照）

| 关键词 | 约匹配仓库数 |
|--------|-------------|
| `polymarket copy` | **469** |
| `polymarket copy-trading` | **276** |
| `polymarket copytrading` | **48** |

实际可用项目远少于上述数字：大量仓库为 SEO 垃圾描述、空壳 fork、或含恶意 npm 依赖的钓鱼项目。

### 1.2 源码抽样方法

对 **Stars ≥ 4** 且语言为 TypeScript / Python / Rust 的仓库进行 README、`.env.example`、`config` 与核心源码抽样；共深度分析 **13** 个代表性项目（见 §2）。

### 1.3 安全提醒（必读）

以下类型仓库**不可直接 `npm install` 运行**：

| 红旗 | 示例 |
|------|------|
| Stars 低、Forks 极高 | [kppox/polymarket-copy-bot](https://github.com/kppox/polymarket-copy-bot)（242★ / 4968F） |
| 仿冒 npm 源 `registrynpmjs.to` | 同上，含 `enquirer.verifyConfiguration(privateKey)` |
| README 重复堆砌关键词 | 多数 dexorynlabs、Obsidian-Trades 类仓库 |
| 组织被劫持分发恶意 bot | [StepSecurity 报告](https://www.stepsecurity.io/blog/malicious-polymarket-bot-hides-in-hijacked-dev-protocol-github-org-and-steals-wallet-keys) |

**功能调研仍可参考其设计思路，但禁止照搬依赖与私钥处理代码。**

---

## 2. 代表性开源项目

| Stars | 语言 | 仓库 | 特点摘要 |
|------:|------|------|----------|
| 242 | TS | [kppox/polymarket-copy-bot](https://github.com/kppox/polymarket-copy-bot) | 轮询 Data API；⚠️ 恶意依赖 |
| 101 | Py | [Joshbazz/polymarket_copy_trader](https://github.com/Joshbazz/polymarket_copy_trader) | 跟排行榜钱包；简单配置 |
| 97 | Rust | [taetaehoho/polymarket-copytrader](https://github.com/taetaehoho/polymarket-copytrader) | WS + FAK 重试 + 熔断器 |
| 56 | Py | [dexorynlabs/polymarket-trading-bot-python](https://github.com/dexorynlabs/polymarket-trading-bot-python) | 功能宣传多，需审计 |
| 49 | TS | [TradeSEB/polymarket-copytrading-bot](https://github.com/TradeSEB/polymarket-copytrading-bot) | WebSocket 实时 + FAK |
| 48 | TS | [shmlkv/polymarket-copy-trading-bot](https://github.com/shmlkv/polymarket-copy-trading-bot) | Web UI + MongoDB + 分层倍数 |
| 31 | TS | [duolaAmengweb3/duola](https://github.com/duolaAmengweb3/duola) | CLI：leader/backtest/autopilot |
| 30 | TS | [devdasx/Polymarket-Copy-Trading-Bot](https://github.com/devdasx/Polymarket-Copy-Trading-Bot) | 基础跟单 + multiplier |
| 26 | Py | [realfishsam/Polymarket-Copy-Trader](https://github.com/realfishsam/Polymarket-Copy-Trader) | 极简 copy_percentage |
| 16 | TS | [Predict-Org/Polymarket-Copy-Trade-Bot](https://github.com/Predict-Org/Polymarket-Copy-Trade-Bot) | 多 leader + WS + FOK 退出 |
| 6 | TS | [neosun100/polycopy](https://github.com/neosun100/polycopy) | 安全加固 fork；功能最全之一 |
| 4 | Py | [gnanam1990/polymarket-copy-bot](https://github.com/gnanam1990/polymarket-copy-bot) | 过滤引擎 + 纸面 + Flask UI |
| 4 | Py | [huahuajhu/polymarket-copy-bot](https://github.com/huahuajhu/polymarket-copy-bot) | 回测/纸面（模拟数据） |
| 2 | TS | [Adialia1/Polybot](https://github.com/Adialia1/Polybot) | SL/TP/Trailing + Dashboard |

GitHub 搜索入口：

- [polymarket copy bot (by stars)](https://github.com/search?q=polymarket+copy+bot&type=repositories&s=stars&o=desc)
- [polymarket copy trading](https://github.com/search?q=polymarket+copy+trading&type=repositories&s=stars&o=desc)

---

## 3. 功能总表（从源码提取）

以下按 **模块** 归纳各仓库中**合理且技术上可行**的功能。  
列「出现项目」表示在抽样源码/README 中明确存在，而非猜测。

### 3.1 目标与监听（Leader / Monitor）

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| 单 Leader proxy 地址跟单 | `COPY_TARGET_USER` / `TARGET_WALLET` | kppox, TradeSEB, devdasx |
| **多 Leader 并行** | 逗号/JSON 数组配置多个地址 | polycopy, shmlkv, Polybot, gnanam1990 |
| Leader 别名 / ID | 便于配置与日志 | duola, PolyMirror |
| 用户名 → proxy 解析 | 爬 Polymarket 页面 `__NEXT_DATA__` | kppox |
| Profile URL / 用户名添加 | Dashboard 输入 URL 或 username | gnanam1990 |
| Data API 轮询 activity | `GET /activity?user=&type=TRADE` | 绝大多数 |
| 轮询间隔可配 | 1s–15s | polycopy, Polybot, kppox |
| 活动条数 limit | 10–500 | kppox, polycopy |
| 忽略过旧成交 | `TOO_OLD_TIMESTAMP` / max age hours | polycopy, PolyMirror |
| 只跟 TRADE 类型 | 忽略 REDEEM/SPLIT/MERGE | kppox, polycopy |
| **WebSocket 实时监听** | 低于秒级延迟 | TradeSEB, Predict-Org, taetaehoho |
| WS 断线重连 + 指数退避 | 生产必备 | TradeSEB |
| 排行榜钱包跟单 | 跟月度 top 钱包 | Joshbazz |
| Leader 历史同步 | 拉取历史成交入库 | duola `sync` |
| Leader 统计分析 | 胜率、成交量、市场分布 | duola `inspect`, shmlkv Web |

### 3.2 去重与状态

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| txHash + asset + side 去重 | 防重复下单 | kppox, TradeSEB, polycopy |
| 无 tx 时用 timestamp 去重 | 降级 key | kppox, PolyMirror |
| seen 集合持久化 | 重启不重复跟旧单 | polycopy (NeDB), PolyMirror (SQLite) |
| BUY 短窗口去重 | 30s 内同 trader 同 market | Polybot |
| 同 market+side 时间 dedup | 防 partial fill 重复 | gnanam1990 |
| 持仓本地跟踪 | leader_id + token → shares | polycopy, Polybot, PolyMirror |
| Crash recovery | 磁盘状态恢复 | Polybot |
| Position reconciliation | 定期与链上/API 对账 | Polybot |

### 3.3 仓位计算（Sizing）

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| 固定倍数 `SIZE_MULTIPLIER` | leader size × N | kppox, TradeSEB, devdasx |
| **PERCENTAGE 策略** | leader 名义金额 × X% | polycopy, shmlkv |
| **FIXED 策略** | 每笔固定 USD | polycopy |
| **ADAPTIVE 策略** | 大单低比例、小单高比例 | polycopy |
| **Tiered multipliers** | 按 leader 订单 USD 区间不同倍数 | polycopy, shmlkv |
| 按账户规模缩放 | USER_ACCOUNT_SIZE vs leader | shmlkv, Polybot |
| Leader allocation 权重 | 多 wallet 分配 60%/40% | Polybot |
| `copy_percentage` 简配 | 单一比例 | realfishsam |
| 余额约束截断 | 不超过可用 USDC | polycopy copyStrategy.ts |
| 单笔 MAX / MIN USD | 上下限 | 几乎全部 |
| 单 market 持仓上限 | `MAX_POSITION_SIZE_USD` | polycopy, Polybot |
| 日成交量上限 | `MAX_DAILY_VOLUME_USD` | polycopy |
| **Trade aggregation** | 小单合并后再下 | polycopy, shmlkv |
| 聚合时间窗口 | 如 300s | polycopy |

### 3.4 过滤与信号质量

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| 价格区间过滤 | min/max price（如 3¢–70¢） | gnanam1990, Polybot |
| ROI / 利润门槛 | `(1-price)/price` 最小 ROI | gnanam1990 |
| 概率区间 | MIN/MAX_PROBABILITY | Polybot |
| 最大买卖价差 | MAX_SPREAD | Polybot |
| 关键词黑名单/白名单 | market title 过滤 | Polybot |
| 最大持仓数 | MAX_OPEN_POSITIONS | gnanam1990, Polybot |
| 最小 share / 最小 USD | 跳过过小单 | kppox, polycopy |
| 滑点容忍 | 当前价 vs leader 价 | polycopy |
| 体育/实验市场警告 | README 提示 | Predict-Org |

### 3.5 订单执行（Execution）

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| CLOB 限价 GTC | 用 leader 价挂单 | kppox |
| **FAK 市价** | 快速成交 | TradeSEB, taetaehoho, gnanam1990 |
| **FOK 市价** | 全成或取消 | Predict-Org, gnanam1990 |
| tick_size 读取与价格取整 | orderbook tick | kppox, polycopy |
| neg_risk 市场支持 | CLOB negRisk 参数 | TradeSEB, Predict-Org |
| 跟 BUY | 标准路径 | 全部 |
| **跟 SELL / 镜像减仓** | leader 卖则跟卖 | polycopy, Polybot, TradeSEB |
| SELL 余额校验 | 防 oversell | TradeSEB, Polybot, PolyMirror |
| COPY_SELLS 开关 | 仅跟买 | Polybot |
| 订单重试 + 指数退避 | 网络/CLOB 失败 | polycopy, Polybot |
| **FAK 失败重提交** | 加价追单、多档 attempt | taetaehoho |
| GTD 最后一档 attempt | FAK 失败后改 GTD | taetaehoho |
| 按 whale 规模分 tier 追价 | 大单 buffer 不同 | taetaehoho |
| API Key 自动 derive/create | CLOB 认证 | kppox, polycopy |
| signatureType 0/1/2 | EOA / proxy / Safe | kppox, Predict-Org, Polybot |
| 延迟复制 COPY_DELAY_MS | 人为延迟 | Polybot |

### 3.6 风控与保护

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| **Preview / Dry-run** | 只记录不下单 | polycopy, Polybot, PolyMirror |
| Paper trading 模拟 | 滑点/gas/FOK 拒绝 | gnanam1990, huahuajhu |
| **Kill Switch / 日亏损上限** | `DAILY_LOSS_CAP_PCT` | polycopy |
| 日亏损 USD 上限 | DAILY_LOSS_LIMIT | Polybot |
| 全局开关 | ENABLE_COPY_TRADING | TradeSEB, kppox |
| **Stop Loss** | 止损百分比 | Polybot |
| **Take Profit** | 止盈百分比 | Polybot |
| **Trailing Stop** | 从峰值回撤卖出 | Polybot |
| 最大持仓时间 | MAX_HOLD_TIME_HOURS | Polybot |
| **Circuit breaker** | 大单+深度不足暂停 | taetaehoho |
| 冲突信号策略 | first / skip / majority / priority | Polybot, PolyMirror |

### 3.7 结算与链上

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| 已结算市场自动 redeem | 定时赎回 | TradeSEB `REDEEM_DURATION` |
| auto-resolver 模块 | 关闭已结束仓位 | shmlkv |
| Token allowance 检查/设置 | USDC/CTF approve | polycopy scripts |
| Proxy / Gnosis Safe 识别 | 脚本辅助 | polycopy scripts |

### 3.8 观测、UI 与集成

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| 结构化日志 | 文件 + console | Polybot, TradeSEB |
| **Telegram 通知** | 成交/报错/Kill Switch | polycopy, Polybot |
| Telegram Bot 命令 | status/positions | Polybot |
| **Web Dashboard** | 持仓/PnL/配置 | shmlkv, polycopy, gnanam1990, Polybot |
| Trader 分析页 | ROI/胜率/成交量图表 | shmlkv |
| REST API + Swagger | 外部集成 | polycopy |
| SSE 实时推送 | 前端 live feed | gnanam1990 |
| Health Check HTTP | 监控 uptime | Polybot, shmlkv |
| Config hot-reload | 不重启改 SL/TP | Polybot |
| 手动 Sell All / Cancel All | Web 控制 | Polybot |
| **Docker / Compose** | 生产部署 | polycopy, shmlkv |
| **MCP Server** | AI agent 接入 | polycopy, polyhub-skills |
| CLI 工具链 | leader/sync/backtest/doctor | duola |
| Autopilot 一键 onboard | 注册+配置+后台运行 | duola |

### 3.9 研究与回测（非实盘）

| 功能 | 说明 | 出现项目 |
|------|------|----------|
| 历史回测 | 模拟跟单 PnL | duola, huahuajhu |
| Paper trade 模式 | 实时模拟 | huahuajhu, gnanam1990 |
| 性能指标 | PnL、胜率、Sharpe、回撤 | huahuajhu |
| 混淆矩阵 | UP/DOWN 准确率 | huahuajhu |
| Leader 扫描脚本 | 从市场找潜在 leader | polycopy scripts |
| 模拟 profitability | 算法审计 | polycopy scripts |

---

## 4. 技术栈分布（抽样）

| 语言 | 占比（Top 60 仓库目测） | 典型能力 |
|------|---------------------------|----------|
| **TypeScript** | 最多 | CLOB SDK、Web UI、WS |
| **Python** | 次之 | 快速脚本、Flask UI、数据分析 |
| **Rust** | 少量 | 低延迟 WS、FAK 重试、熔断 |
| Elixir | 极少 | [lalabuy948/poly_copy](https://github.com/lalabuy948/poly_copy) |

官方 SDK（2026）：[`@polymarket/clob-client-v2`](https://docs.polymarket.com/v2-migration)（TS）、`polymarket_client_sdk_v2`（Rust）、`py-clob-client-v2`（Python）。

---

## 5. PolyMirror 功能采纳路线图

基于调研，建议 PolyMirror（单平台多 Leader）按优先级实现：

### P0 — MVP（必须有）

- [x] 多 Leader YAML 配置（ scaffold 已有）
- [x] Data API 轮询
- [x] txHash 去重 + SQLite seen
- [x] PERCENTAGE sizing + MAX/MIN 单笔
- [x] Preview mode
- [x] SELL 持仓校验
- [ ] CLOB V2 实盘下单（GTC）
- [ ] tick_size 校验

### P1 — 生产必备

- [ ] Kill Switch（日亏损 %）
- [ ] 每 Leader 独立 limits / filters
- [ ] 冲突策略（priority_leader）
- [ ] 结构化日志 + 错误持久化
- [ ] 过旧 activity 过滤（已有 max_trade_age_hours）
- [ ] 网络重试

### P2 — 增强

- [ ] FIXED / ADAPTIVE sizing
- [ ] Tiered multipliers
- [ ] Trade aggregation
- [ ] 滑点容忍
- [ ] Telegram 通知
- [ ] WebSocket 监听（降延迟）

### P3 — 进阶

- [ ] SL / TP / Trailing stop
- [ ] Web Dashboard
- [ ] Leader 用户名解析
- [ ] 自动 redeem / stale 仓位清理
- [ ] FAK + 失败重试（参考 taetaehoho）
- [ ] Circuit breaker（大单+深度）

### P4 — 研究向（可选）

- [ ] Paper trading 模拟层
- [ ] 回测 CLI
- [ ] Leader inspect / 扫描脚本

### 明确不做（v0.x）

- 跨 venue 映射（Kalshi/Limitless）→ 见未来 `CROSS_VENUE.md`
- 内置私钥「验证/上传」类逻辑
- 依赖非官方 npm 源

---

## 6. 配置项对照表（常见 env / yaml）

| 配置项 | 含义 | 典型默认值 | 来源 |
|--------|------|------------|------|
| `USER_ADDRESSES` / leaders[] | 多 Leader 地址 | — | polycopy |
| `COPY_STRATEGY` | PERCENTAGE/FIXED/ADAPTIVE | PERCENTAGE | polycopy |
| `COPY_SIZE` / copy_size | 策略主参数 | 10% | polycopy |
| `MAX_ORDER_SIZE_USD` | 单笔上限 | 100 | polycopy |
| `MIN_ORDER_SIZE_USD` | 单笔下限 | 1 | polycopy |
| `PREVIEW_MODE` / DRY_RUN | 纸面/预览 | true | polycopy, Polybot |
| `DAILY_LOSS_CAP_PCT` | Kill Switch | 20 | polycopy |
| `SLIPPAGE_TOLERANCE` | 滑点 | 0.05 | polycopy |
| `TIERED_MULTIPLIERS` | 分层倍数 | — | polycopy |
| `TRADE_AGGREGATION_*` | 小单合并 | false | polycopy |
| `SIZE_MULTIPLIER` | 固定倍数 | 1.0 | kppox, TradeSEB |
| `ORDER_TYPE` | GTC/FAK/FOK | GTC/FAK | TradeSEB |
| `FETCH_INTERVAL` / poll_interval_ms | 轮询 | 1–15s | polycopy |
| `TRACK_WALLETS` + allocation | 多 wallet 权重 | JSON | Polybot |
| `CONFLICT_STRATEGY` | 冲突处理 | first | Polybot |
| `STOP_LOSS_PERCENT` | 止损 | -25 | Polybot |
| `COPY_SELLS` | 是否跟卖 | true | Polybot |

PolyMirror 当前配置见 [`config.example.yaml`](../config.example.yaml)。

---

## 7. 结论

1. GitHub 上 Polymarket 跟单 bot **数量多、质量参差**，功能高度收敛到「监听 → 缩放 → 风控 → CLOB 下单」。
2. **多 Leader、sizing 策略、Preview、去重、SELL 校验** 是共识性的合理功能。
3. **Web UI、Telegram、Kill Switch、Trade Aggregation、Tiered multipliers** 是成熟项目的差异化功能。
4. **Rust 项目**（taetaehoho）在 **WS + FAK 重试 + Circuit breaker** 上领先，适合 PolyMirror 后期借鉴。
5. **duola** 在 **CLI + backtest + autopilot** 工作流上最完整，适合 PolyMirror 运维工具参考。
6. 采纳功能时必须 **跳过恶意仓库的依赖与私钥处理代码**，仅参考架构与配置设计。

---

## 8. 参考文献

- [Polymarket CLOB V2 Migration](https://docs.polymarket.com/v2-migration)
- [Polymarket Clients & SDKs](https://docs.polymarket.com/api-reference/clients-sdks)
- [StepSecurity: Malicious Polymarket bots](https://www.stepsecurity.io/blog/malicious-polymarket-bot-hides-in-hijacked-dev-protocol-github-org-and-steals-wallet-keys)
- [SafeDep: Malicious npm packages](https://safedep.io/malicious-polymarket-npm-crypto-wallet-drainer)
