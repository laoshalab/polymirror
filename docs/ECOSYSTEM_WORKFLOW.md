# PolyMirror 生态工作流与功能规划

> 版本：1.0 · 2026-06-27  
> 适用：产品规划、Dashboard 迭代、B 站「预测市场实验室」内容策划  
> 关联：[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) · [FEATURES_SURVEY.md](FEATURES_SURVEY.md) · [DEEP_ANALYSIS.md](DEEP_ANALYSIS.md)

---

## 1. 文档目的

本文定义 PolyMirror 在 **预测市场工具生态** 中的位置，明确：

1. **与 Predicts.guru、PolyWallet 等工具的分工**（做什么、不做什么）
2. **用户从「筛人」到「Live 跟单」的完整工作流**
3. **PolyMirror 应优先实现的功能**（P0–P3 与里程碑 M1–M3）
4. **与自媒体「预测市场实验室」的内容配合方式**

---

## 2. 生态分工（产品边界）

PolyMirror **不应**做成第二个 Predicts.guru 或 PolyWallet，而应占住：

> **研究之后 → Preview 验证 → Live 执行**

| 工具 | 定位 | 核心场景 | PolyMirror 是否重做 |
|------|------|----------|---------------------|
| [Predicts.guru](https://www.predicts.guru/) | 免费分析站 | 粗筛 Leader、Wallet Checker、Event Analytics、Live Activity | ❌ 不重做 |
| [PolyWallet](https://polywallet.app/) | Portfolio Tracker | Live PnL、PnL 日历、观察列表、长期盯盘 | ❌ 不重做 |
| [Wallet Master](https://www.walletmaster.tools/polymarket-wallet-tracker/) | 专业钱包雷达 | 百万级钱包、80+ 指标批量筛选 | ❌ 不重做 |
| [PolyTrack](https://www.polytrackhq.app/) | 鲸鱼追踪 + 告警 | 成交通知、轻量 copy 入口 | ❌ 不重做 |
| **PolyMirror** | 自托管跟单引擎 | 观察池 → Preview → Live 执行 + 风控 | ✅ 核心 |

### 2.1 明确不做（v1.x）

| 不做 | 交给 | 原因 |
|------|------|------|
| 全站 Live 成交流、事件级 Analytics | Predicts.guru | 免费、成熟，重复建设 ROI 低 |
| PnL 日历热力图、长期组合视图 | PolyWallet | 其核心竞争力 |
| 700 万钱包批量筛选 | Wallet Master | 专业付费层 |
| Kalshi / 跨平台跟单 | — | 见 [DEVELOPMENT_PLAN.md §8](DEVELOPMENT_PLAN.md) |
| AI 交易者画像 | 第三方 | 易误导，合规风险 |
| 托管私钥 SaaS | — | 与自托管定位冲突 |

---

## 3. 用户工作流

### 3.1 推荐流程

```
Predicts.guru     粗筛 + 深查画像 + 看事件
       ↓
PolyWallet        观察 7～14 天（PnL 日历、Live 持仓）
       ↓
PolyMirror        观察池 → Preview 7 天 → Live 小额
       ↓
预测市场实验室     内容教这条流程，PolyMirror 作 Demo 工具
```

### 3.2 各阶段职责

| 阶段 | 工具 | 用户目标 | 产出 |
|------|------|----------|------|
| ① 初筛 | Predicts.guru | Leaderboard / Smart Money → Wallet Checker | 3～5 人候选池 |
| ② 深查 | Predicts.guru | Event Analytics、Live Activity 交叉验证 | 排除误读（高胜率小样本等） |
| ③ 观察 | PolyWallet | 加入观察列表，看 7/30 天 PnL 日历 | 确认「还在赚、还活跃」 |
| ④ 模拟 | PolyMirror Preview | 模拟跟单，看 COPY / SKIP | Preview 报告 |
| ⑤ 执行 | PolyMirror Live | 小额 + Kill Switch | 真实跟单 + 活动流审计 |

### 3.3 架构示意

```
┌─────────────────────────────────────────────────────────────┐
│                    外部工具（PolyMirror 不重做）                 │
│  Predicts.guru：筛人/事件  │  PolyWallet：PnL/日历/盯盘       │
└────────────────────────────┬────────────────────────────────┘
                             │ 外链 + 观察池
┌────────────────────────────▼────────────────────────────────┐
│                         PolyMirror                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ 发现 + 观察池 │→│ DETECT/Preview│→│ Live 执行 + 风控     │  │
│  └─────────────┘  └──────────────┘  └─────────────────────┘  │
│         │                 │                    │              │
│         └─────────────────┴────────────────────┘              │
│                    Preview 报告 / 活动流审计                    │
└─────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│              预测市场实验室（B 站 / YouTube）                  │
│  教流程 │ 录 Preview 报告 │ PolyMirror 作案例工具               │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 功能规划

### 4.1 P0 — 执行核心（跟单引擎本分）

来源：[DEEP_ANALYSIS.md](DEEP_ANALYSIS.md) 生态共性缺口。与外部工具无关，**必须做稳**。

| 功能 | 价值 | 状态参考 |
|------|------|----------|
| CLOB V2 实盘完整路径 | 2026 生产可用 | BUY/SELL、tick、neg_risk |
| Preview 默认 + Live 二次确认 | 信任与安全 | 核心卖点 |
| Kill Switch + 日限额 | 资金保护 | Dashboard 可视化进度 |
| 多 Leader + 冲突策略 | 跟多人 | skip_both / net / priority_leader |
| SELL 持仓校验 + 对账 | 防 oversell、重启漂移 | Position reconciliation |
| 过旧成交过滤 + 去重 | 防追旧单 | txHash + SQLite seen |
| 自动 redeem 已结算 | 资金不锁死 | 生态普遍缺失 |

> 无 P0，后续功能再完整也不能称为「生产级跟单引擎」。

### 4.2 P1 — 工作流闭环（生态结合层 · 最优先的产品增量）

把 Predicts.guru 筛人、PolyWallet 观察、PolyMirror 跟单 **串成一条线**。

#### 4.2.1 观察池（Watchlist / Observation Pool）⭐ 首推

| 能力 | 说明 |
|------|------|
| 状态机 | `候选 → 观察中 → Preview 中 → Live 中 → 已停用` |
| 来源 | 「发现 Trader」一键加入观察池（不必立刻跟单） |
| 观察期 | 可设最短观察天数（7 / 14 天），到期提醒 |
| 外链 | 一键打开 Predicts.guru / PolyWallet / Polymarket 资料页 |
| 备注 | 标签 whale / sports / politics，记录选型理由 |

**与 PolyWallet 区别：** PolyWallet 看 PnL 时间轴；观察池管理 **「是否进入 Preview」的决策流程**。

#### 4.2.2 DETECT-only 监听模式 ⭐

- 只记录 Leader 成交（DETECT），不 COPY
- 观察期「只听不动」
- 与 Preview 区别：Preview 模拟「若跟会怎样」；DETECT-only 纯日志

适用：**Predicts 筛完 → 先听 1 周 → 再开 Preview**。

#### 4.2.3 Preview 复盘报告 ⭐⭐（产品 + 内容双用）

Dashboard 生成 Preview 周期报告（7 / 14 / 30 天）：

| 报告项 | 用途 |
|--------|------|
| 本会 COPY / SKIP 笔数 | 验证跟单逻辑 |
| SKIP 原因分布 | 调参（价格、限额、Kill Switch…） |
| 模拟敞口、模拟成交额 | 评估风险 |
| 按 Leader 拆分 | 决定跟谁、跟多少 |
| 导出 CSV / 截图友好摘要 | B 站「Preview 7 天实录」录屏素材 |

> PolyWallet 无法提供「若跟单会怎样」的 counterfactual；这是 PolyMirror 独有能力。

#### 4.2.4 发现 Trader 页增强（轻量，不替代 PolyWallet）

在现有 Polymarket Leaderboard API 上增强 **跟单前判断**：

| 增强 | 说明 |
|------|------|
| PnL + Volume + ROI 同屏 | 防「只看 PnL」误读 |
| 7d / 30d / 全时段 | 区分「还在赚」与「吃老本」 |
| 赛道标签 | 政治 / 体育 / 加密，支持赛道匹配 |
| 双 Trader 对比 | 并排 2 人再决定加谁 |
| 「加入观察池」vs「直接 Preview」 | 两个入口，引导正确流程 |

#### 4.2.5 Onboard 向导

Dashboard 首次使用按步骤引导：

```
配置钱包 → 发现/添加观察对象 → 观察 N 天 → 开 Preview → 看报告 → 小额 Live
```

与 [dashboard/01-overview.md](dashboard/01-overview.md) 推荐流程一致。

### 4.3 P2 — 执行增强

| 功能 | 价值 |
|------|------|
| WebSocket 监听 | 降延迟，少漏单 |
| FAK + 失败重试 | 提高成交率 |
| 按 Leader 独立 filters | 价格区间、赛道关键词、最大持仓市场数 |
| Trade aggregation | 小单合并 |
| Tiered multipliers | 大单低比例、小单高比例 |
| Telegram 增强 | Leader 成交、COPY/SKIP、Kill Switch、观察期到期 |
| SL/TP / 最大持仓时间（可选） | 进阶用户 |

详见 [FEATURES_SURVEY.md §5](FEATURES_SURVEY.md)。

### 4.4 P3 — 内容与生态（加分项）

| 功能 | 价值 |
|------|------|
| 工具链快捷入口 | Dashboard 侧栏：Predicts.guru / PolyWallet 链接 + 用法提示 |
| Leader 筛选 Checklist | 内置 5 条实验室标准（见 §5.2），勾选后再进 Preview |
| Weekly 摘要 | 观察池动态 + Preview 统计（配合概率周报） |
| 活动流分享/导出 | 单条 COPY/SKIP 决策可导出，做复盘内容 |
| CLI：`polymirror inspect <wallet>` | 终端版 Leader 快查 |

---

## 5. 与「预测市场实验室」内容配合

### 5.1 账号定位

| 项目 | 内容 |
|------|------|
| 名称 | 预测市场实验室 / Prediction Market Lab |
| 定位 | 概率解读 · 事件复盘 · Preview 跟单实验 |
| 固定栏目 | 【概率周报】【事件复盘】【实验室手记】 |

### 5.2 Leader 筛选五标准（Checklist 可内置 Dashboard）

1. **样本够大** — Volume 与交易笔数不能太少  
2. **PnL 与 ROI 同向** — 不只看谁赚得多  
3. **胜率不单独决策** — 必须结合 Volume 与持仓结构  
4. **赛道匹配** — 他擅长的市场你是否跟得上  
5. **仍在活跃** — Live Activity / PolyWallet 近期有成交  

### 5.3 视频系列与功能对应

| 视频选题 | 主要工具 | PolyMirror 露出 |
|----------|----------|-----------------|
| Predicts.guru 筛 Leader 全流程 | Predicts.guru | 弱 |
| PolyWallet 观察 14 天 | PolyWallet | 弱 |
| Preview 7 天实录 | PolyMirror | **强**（Preview 报告） |
| 多 Leader 风控配置 | PolyMirror | **强** |

### 5.4 产品露出原则

```
痛点（普遍） → 我的实践（真实） → 工具演示（可选） → 风险边界（必须）
```

| 强度 | 场景 |
|------|------|
| 零露出 | 科普、概率、事件复盘 |
| 弱露出 | 工具教程、找 Leader |
| 中露出 | Preview 实录、风控教学 |
| 强露出 | 仅视频末尾 30 秒 CTA + 简介 GitHub |

---

## 6. 里程碑

### M1 — 能放心跟（约 4～6 周）

- [ ] P0 全部验收  
- [ ] Preview 报告 v1（笔数、SKIP 原因、按 Leader 拆分）  
- [ ] 可拍摄：【实验室手记】Preview 7 天实录  

### M2 — 完整决策流（约 4～6 周）

- [ ] 观察池 + 状态机  
- [ ] DETECT-only 模式  
- [ ] 发现 Trader 页增强 + 双 Trader 对比  
- [ ] Onboard 向导 + 外链工具链  
- [ ] 可拍摄：Predicts → PolyWallet → PolyMirror 三期系列  

### M3 — 生产级执行（持续）

- [ ] WebSocket、FAK 重试、自动 redeem  
- [ ] SL/TP、Leader 独立 filters  
- [ ] 面向进阶用户与小团队  

### 若只能做 5 件事（最小增量集）

1. 观察池 + 状态机  
2. Preview 7/14 天复盘报告（可导出）  
3. DETECT-only 观察模式  
4. 自动 redeem + 持仓对账  
5. WebSocket 降延迟  

---

## 7. 与现有能力对照

| 已有（保持） | 建议新增 |
|--------------|----------|
| 多 Leader 跟单 | 观察池 + 状态机 |
| Preview / Live | DETECT-only 模式 |
| 发现 Trader 排行榜 | 发现页增强 + 对比 + 观察池入口 |
| 活动流 DETECT/COPY/SKIP | Preview 周期报告 + 导出 |
| Kill Switch、冲突、策略缩放 | WebSocket、redeem、对账 |
| Dashboard 多账户 | Onboard 向导 + 外链工具链 |

---

## 8. 更新版产品定义（一句话）

> **PolyMirror = 自托管 Polymarket 跟单引擎，带「观察 → Preview 验证 → Live 执行」完整工作流；研究用 Predicts.guru，盯 PnL 用 PolyWallet，跟单决策与执行用 PolyMirror。**

---

## 9. 相关文档

- [README.md](../README.md) — 功能概览与 Quick Start  
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) — 技术里程碑与排期  
- [FEATURES_SURVEY.md](FEATURES_SURVEY.md) — 开源生态功能调研  
- [DEEP_ANALYSIS.md](DEEP_ANALYSIS.md) — 竞品完善度与差异化  
- [MARKETING_PITCH_10MIN.md](MARKETING_PITCH_10MIN.md) — 推广讲稿  
- [dashboard/01-overview.md](dashboard/01-overview.md) — Dashboard 推荐流程  
- [WEB_AGENT_ARCHITECTURE.md](WEB_AGENT_ARCHITECTURE.md) — Web + Agent 网站化架构（平台不碰私钥）

---

**免责声明：** PolyMirror 为跟单执行与风控工具，不构成投资建议。预测市场存在亏损风险。Predicts.guru、PolyWallet 等为第三方服务，使用前请自行评估其数据准确性与服务条款。
