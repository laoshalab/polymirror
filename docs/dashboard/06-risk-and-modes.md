## 功能说明

**风控** 与 **运行模式** 是跟单安全的两道防线：

| 机制 | 作用 |
|------|------|
| Preview 模式 | 不真实下单，先验证逻辑 |
| 限额与 Kill Switch | 限制亏损与异常行为 |
| Live 确认 | 切换实盘需二次确认 + 环境变量 |

---

## Preview 与 Live

### 模式对比

| | Preview | Live |
|---|---------|------|
| 是否下单 | 否（模拟） | 是（真实 CLOB） |
| 数据库 | Preview DB | Live DB |
| 资金风险 | 无 | 有 |
| 默认 | ✓ 首次必须 | 需主动开启 |

### 切换路径

**设置 → 模式** 标签页

| 操作 | 要求 |
|------|------|
| Preview → Live | 界面二次确认 |
| Live 环境变量 | `.env` 设置 `POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING` |
| Live → Preview | 界面确认，停止真实下单 |

### Preview → Live 数据迁移

切换 Live 时引擎会**热重载** `polymirror.db`，并自动合并 Preview DB 中的：

| 数据 | 是否迁移 | 说明 |
|------|----------|------|
| `seen_trades` 去重 | ✓ | 避免近期 Leader 成交重复跟单 |
| `positions` 引擎持仓 | ✓（仅当 Live 无同 leader+token 记录） | **仅本地跟踪**；SELL 仍以链上钱包余额为准 |
| 日统计 / Kill Switch | ✗ | Live DB 独立累计 |
| 链上 USDC / 真实持仓 | ✗ | 需在 Polymarket 钱包充值；与 Preview 模拟无关 |

Live BUY 前会查询 CLOB **USDC 余额**；不足时在 audit 记 SKIP，不会发单。

### 推荐上线流程

```
Preview 运行 ≥ 3–7 天
    ↓
活动流 COPY 行为符合预期
    ↓
设置 → 风控：确认日限额合理
    ↓
使用小额专用钱包
    ↓
设置 → 模式：切换 Live
    ↓
总览确认 Live 徽章，持续监控
```

---

## 风控页面

**路径：** 风控

### Kill Switch

当日亏损达到 `daily_loss_cap_pct` 上限时自动触发：

| 状态 | 行为 |
|------|------|
| 激活 | 引擎 **停止一切下单** |
| 重置 | 风控页手动确认重置（当日可继续，除非再次触发） |

总览页同步显示 Kill Switch 徽章。

### 限额进度条

| 指标 | 说明 |
|------|------|
| 日成交额 | 相对 `max_daily_volume_usd` |
| 日亏损 | 相对 Kill Switch 阈值 |
| 持仓市场数 | 相对 `max_open_markets` |

进度 ≥ 80% 时进度条高亮警告。

### 修改限额

**设置 → 风控** 标签页修改全局参数；Leader 级别上限在 **Leaders** 行内或编辑页配置。

---

## 风控参数速查

| 参数 | 典型默认值 | 作用 |
|------|-----------|------|
| `max_order_usd` | 50 | 全局单笔上限 |
| `min_order_usd` | 1 | 低于此金额 skip |
| `max_daily_volume_usd` | 500 | 日成交上限 |
| `daily_loss_cap_pct` | 20 | 日亏损达起始资金 N% 触发 Kill Switch |
| `max_open_markets` | 20 | 最大同时持仓市场数 |
| `starting_capital_usd` | 500 | Kill Switch 计算基准 |

---

## 安全原则

1. **Preview-first**：未充分验证不开 Live
2. **小额钱包**：跟单专用，与主钱包隔离
3. **限额从严**：初期把 `max_order_usd` 和日限额设低
4. **Kill Switch 勿随意重置**：触发说明当日已出现较大回撤，应先排查原因
