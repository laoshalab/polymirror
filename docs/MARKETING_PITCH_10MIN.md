# PolyMirror 10 分钟推广介绍流程

**版本：** 1.0  
**适用场景：** 线下分享、社群直播、产品路演、短视频口播提纲  
**目标听众：** Polymarket 玩家 + 有一定技术接受度的自托管用户

---

## 一、整体结构（10 分钟）

| 阶段 | 时长 | 目标 |
|------|------|------|
| ① 开场钩子 | 1:00 | 让人知道「这和我有关」 |
| ② 市场机会 | 1:00 | 为什么 Polymarket 跟单值得做 |
| ③ 产品定义 | 1:30 | 一句话 + 三句话讲清 PolyMirror |
| ④ 核心卖点 | 2:00 | 和竞品/手工跟单的差异 |
| ⑤ 产品演示 | 2:00 | 看得见、信得过 |
| ⑥ 适用人群 | 1:00 | 听众对号入座 |
| ⑦ 安全与合规 | 1:00 | 建立信任、降低顾虑 |
| ⑧ 行动号召 | 0:30 | 明确下一步 |

---

## 二、分镜讲稿流程

### ① 开场钩子（0:00–1:00）

**开场句（任选其一）：**

> 「Polymarket 上有人靠信息差赚钱，大多数人却还在手动刷页面、错过成交。」  
> 「GitHub 上跟单机器人很多，但 2026 年真正能放心跑生产的，其实很少。」

**三句话结构：**

1. **痛点**：手动跟单慢、易漏单、难管多个高手
2. **风险**：开源跟单工具多，但不少停更、用旧 SDK，甚至有恶意依赖
3. **解法**：PolyMirror —— 本地自托管的 Polymarket 多 Leader 跟单引擎

---

### ② 市场机会（1:00–2:00）

**讲什么：**

- Polymarket 是预测市场，高手（Leader）持续有成交信号
- 跟单本质：**复制信息优势 + 用你自己的仓位规则控制风险**
- 手工跟单的三个死穴：延迟、无法同时跟多人、没有统一风控

**一句话总结：**

> 「跟单不是赌运气，是用系统化方式复制你认可的交易者，同时把仓位掌握在自己手里。」

---

### ③ 产品定义（2:00–3:30）

**电梯演讲（30 秒版，必背）：**

> **PolyMirror 是跑在你自己电脑或 VPS 上的 Polymarket 跟单机器人。**  
> 它同时监听多个 Leader 的成交，按你为每个 Leader 设定的策略自动缩放仓位，经过滤、去重、冲突处理和风控检查后下单。  
> **默认 Preview 模拟，不真实花钱**；确认逻辑无误后再切 Live 实盘。

**架构一句话：**

```
监听 Leader → 策略缩放 → 风控检查 → Preview/Live 下单 → SQLite 审计
```

**产品边界（营销要诚实）：**

| 是 | 不是 |
|----|------|
| Polymarket 单平台、多 Leader 跟单 | 「保证盈利」工具 |
| 本地 / Web Dashboard 管理，私钥不上云 | Kalshi 等跨平台跟单 |
| Preview 默认，Live 需显式确认 | 托管钱包的 SaaS |

---

### ④ 核心卖点（3:30–5:30）

用 **「问题 → PolyMirror 怎么解决」** 讲，比堆功能更有效：

| 听众关心的问题 | 你的回答（卖点） |
|----------------|------------------|
| 跟一个人不够，想跟多个 | **多 Leader 并行**，每人独立策略和限额 |
| 怕一上线就亏光 | **Preview 默认开启**，先模拟数天再 Live |
| 跟单工具不安全 | **自托管**，私钥只在本地 `.env`，不上传云端 |
| 旧工具不能用 | 基于 **CLOB V2 SDK**（2026 生产环境要求） |
| 多 Leader 方向冲突怎么办 | **冲突策略**：skip_both / net / priority_leader |
| 不会改 YAML | **Web Dashboard**：加 Leader、看 PnL、切模式 |
| 管多个钱包 | **多账户隔离**，各账户独立 Leader 与数据 |
| 失控怎么办 | **Kill Switch**、日限额、单笔上下限、审计日志 |

**差异化金句（可放在 PPT 一页）：**

> 「不是又一个 README 很满的开源脚本 —— 是 Preview 优先、V2 就绪、多 Leader 一等公民的生产级跟单引擎。」

**核心能力速查：**

| 能力 | 说明 |
|------|------|
| 多 Leader 跟单 | 同时跟踪多个地址 / 用户名 |
| 多账户 | 单进程管理多个钱包，数据与 Leader 隔离 |
| Preview 模拟 | 默认不真实下单，先观察再实盘 |
| 策略缩放 | 按比例 / 固定金额 / 自适应 + 分层 multiplier |
| 风控 | 日限额、Kill Switch、单笔上下限、最大持仓市场数 |
| 冲突处理 | 多 Leader 对同一市场反向时的处理策略 |
| 持久化 | SQLite 记录已处理成交、持仓、审计日志、GTC 挂单 |
| 通知 | Telegram + `GET /health` |

---

### ⑤ 产品演示（5:30–7:30）

**推荐演示路径（与产品文档一致）：**

```
① 安装启动 → ② 配置钱包 → ③ 添加 Leader → ④ Preview 观察
       ↓
⑤ 调整策略与风控 → ⑥ 确认活动流正常 → ⑦ 切换 Live（小额）
```

| 步骤 | 展示页面 | 话术要点 |
|------|----------|----------|
| 1 | **总览** | 引擎在跑，Dashboard 实时可见 |
| 2 | **发现 Trader** | 排行榜、一键加 Leader，不用自己扒地址 |
| 3 | **Leader 管理** | 策略：比例 / 固定 / 自适应，跟 10% 还是每笔 $5 你说了算 |
| 4 | **活动流** | DETECT / COPY / SKIP，每一笔决策可追溯 |
| 5 | **风控** | Kill Switch、限额进度，亏损到线自动停 |
| 6 | Preview 日志 | `PREVIEW would copy`，现在没花真钱，是在验证逻辑 |

**Demo 原则：**

- 优先 **Preview 模式**，现场更安全
- 准备 1 个活跃 Leader，避免空屏
- 若网络受限，提前录屏 30 秒备用
- Live 切换仅在充分说明风险后演示，或使用录屏

**Quick Start（演示前可展示）：**

```bash
git clone <repo-url> PolyMirror && cd PolyMirror
npm install
cp .env.example .env
cp config.preview.template.yaml config.yaml
npm run dev
# Dashboard: http://127.0.0.1:8081（health_port 见 config.yaml）
```

---

### ⑥ 适用人群（7:30–8:30）

**三档用户，让听众对号入座：**

1. **Polymarket 活跃玩家**  
   已认可某几个 Trader，想自动化、省时间

2. **量化 / 技术向用户**  
   能接受 Node.js 或 Docker，重视自托管和可审计

3. **小团队 / 工作室**  
   多账户、多 Leader，需要统一风控和 Dashboard

**不适合谁（主动说，反而增信）：**

- 想要「一键暴富、保证胜率」的人
- 完全不愿碰配置、也不看 Preview 结果的人
- 需要 Kalshi 等跨平台跟单的人

---

### ⑦ 安全与合规（8:30–9:30）

**必须讲的三点：**

1. **风险提示**  
   预测市场有亏损可能；跟单不保证复制 Leader 的未来收益

2. **安全实践**
   - 专用小额钱包跑 Live
   - Preview 至少跑数天
   - 不分享 `.env`、不运行来路不明的 fork
   - Proxy 与 EOA 不同时注意签名类型配置

3. **产品承诺边界**  
   PolyMirror 提供的是 **执行与风控工具**，不是投资建议

**信任建设句：**

> 「你的密钥在你机器上，你的规则在你配置里，每一笔跟单在活动流里可查。」

---

### ⑧ 行动号召 CTA（9:30–10:00）

**收尾模板：**

> 如果你已经在 Polymarket 上盯几个高手，PolyMirror 能帮你把「看到 → 跟上」变成系统化流程。  
> 建议路径：**今天 Preview 跑起来 → 观察几天活动流 → 小额 Live 验证。**  
> 文档 / 仓库 / 交流群：[填你的链接]

**CTA 三选一（按渠道选）：**

| 渠道 | CTA |
|------|-----|
| 技术社区 | GitHub Star + Quick Start |
| 社群 | 进群领 `config.preview.template.yaml` |
| 1v1 | 帮装 Preview + 加第一个 Leader |

---

## 三、配套物料清单

| 物料 | 用途 |
|------|------|
| 1 页「电梯演讲」 | 30 秒口头版 |
| 5 页 PPT | 痛点 / 产品 / 卖点 / Demo 截图 / CTA |
| 2 分钟录屏 | 总览 → 发现 Trader → 活动流 Preview |
| 对比表 | PolyMirror vs 手工 vs 典型开源 bot（V2、Preview、多 Leader） |
| FAQ 3 条 | Preview 和 Live 区别、私钥放哪、为什么没 COPY |
| 免责声明 1 行 | 页脚固定展示 |

---

## 四、营销话术原则

### DO ✅

- 强调 **Preview 优先、自托管、可审计、多 Leader 风控**
- 用「省时间、降延迟、规则可控」代替「稳赚」
- 用活动流、Kill Switch 等 **可见功能** 建立信任
- 主动说明产品边界（单平台、非 SaaS、非投资建议）

### DON'T ❌

- 不说「保证盈利」「AI 预测胜率」
- 不贬低具体竞品到人身攻击，用维度对比（V2、Preview、工程化）
- 不回避「需要一定技术上手」（Docker / Node 用户反而是目标人群）

---

## 五、10 分钟时间轴（主持稿）

```
0:00  痛点 + 今天讲什么
1:00  Polymarket 跟单为什么值得做
2:00  PolyMirror 是什么（30 秒电梯 + 架构）
3:30  6 大卖点（多 Leader / Preview / 自托管 / V2 / Dashboard / 风控）
5:30  2 分钟 Demo（Preview 活动流为主）
7:30  谁适合用 / 谁不适合
8:30  安全、合规、风险提示
9:30  CTA + Q&A 预告
10:00 结束
```

---

## 六、附录：多版本口播稿

### 30 秒版

> PolyMirror 是跑在你自己机器上的 Polymarket 跟单引擎。同时跟多个 Leader，每人独立策略和限额；默认 Preview 模拟，确认无误再 Live。私钥自托管，Dashboard 可视化管理，CLOB V2 生产就绪。适合已经在 Polymarket 上认可几个高手、想系统化跟单的用户。

### 1 分钟版

> 手动跟 Polymarket 高手有三个问题：慢、漏、难管多人。GitHub 上的跟单 bot 又多又杂，不少停更或用旧 SDK。  
> PolyMirror 解决这个：本地自托管的多 Leader 跟单引擎，监听成交 → 按你的策略缩放 → 风控检查 → 下单。默认 Preview 不花真钱，Web Dashboard 加 Leader、看活动流、设 Kill Switch。密钥在你机器上，不是托管 SaaS，也不承诺稳赚。  
> 建议路径：Preview 跑几天 → 小额 Live 验证。

### 3 分钟版

在 1 分钟版基础上，补充：

- **多 Leader 冲突**：同一市场反向时可选 skip / net / priority
- **策略**：PERCENTAGE / FIXED / ADAPTIVE + 分层 multiplier
- **Dashboard 页面**：总览、发现 Trader、Leader 管理、活动流、风控、设置
- **部署**：Node.js ≥ 20 或 Docker，`npm run dev` 即可 Preview
- **对比**：相对生态常见项目的 V2 SDK、Preview-first、SQLite 无 MongoDB 运维

---

## 七、附录：FAQ（推广现场常用）

**Q：Preview 和 Live 有什么区别？**  
A：Preview 只记录「本会跟什么单」，不向 CLOB 发真实订单；Live 需 `preview_mode: false` 且 `.env` 中显式 Live 确认。

**Q：私钥放哪里？**  
A：只在本地 `.env`，引擎自托管运行，不上传云端。

**Q：活动流只有 DETECT 没有 COPY？**  
A：可能被价格过滤、最小金额、Kill Switch 等 SKIP，活动流会写原因。

**Q：支持 Kalshi 吗？**  
A：v1.0 仅 Polymarket 单平台。

---

## 八、相关文档

- [README.md](../README.md) — 功能概览与 Quick Start
- [docs/dashboard/01-overview.md](dashboard/01-overview.md) — Dashboard 产品概览与推荐流程
- [docs/USER_GUIDE_SUMMARY.md](USER_GUIDE_SUMMARY.md) — 使用说明书精简版
- [docs/DEEP_ANALYSIS.md](DEEP_ANALYSIS.md) — 生态对比与差异化依据
- [docs/ECOSYSTEM_WORKFLOW.md](ECOSYSTEM_WORKFLOW.md) — 生态分工、工作流与功能规划
- [docs/WEB_AGENT_ARCHITECTURE.md](WEB_AGENT_ARCHITECTURE.md) — Web + Agent 网站化架构

---

**免责声明：** PolyMirror 为跟单执行与风控工具，不构成投资建议。预测市场存在亏损风险，请使用专用小额钱包并先在 Preview 模式下充分验证。
