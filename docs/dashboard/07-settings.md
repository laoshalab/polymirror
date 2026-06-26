## 功能说明

**设置** 页管理 **当前账户** 的全局引擎参数，保存后写入 `config.yaml` 并热重载。

### 标签页一览

| 标签 | 管理内容 |
|------|----------|
| 全局 | 轮询间隔、活动条数、健康检查端口 |
| 风控 | 日限额、Kill Switch 阈值、持仓上限 |
| 执行 | 下单滑点、GTC 超时、聚合窗口 |
| 冲突 | 多 Leader 同市场反向时的处理 |
| 通知 | Telegram 推送开关 |
| 网络 | HTTP 代理配置与测试 |
| 模式 | Preview / Live 切换 |

---

## 全局

| 参数 | 说明 | 建议 |
|------|------|------|
| `poll_interval_ms` | Leader 轮询间隔 | 5000ms 起，过小易限流 |
| `activity_limit` | 每次拉取活动条数 | 默认即可 |
| `copy_trades_only` | 仅跟成交、忽略其他活动 | 一般保持开启 |
| `max_trade_age_hours` | 忽略过旧成交 | 1h 适合大多数场景 |
| `health_port` | Dashboard / API 端口 | 修改后需重启 |

---

## 风控

与 **风控** 页展示的数据对应，在此修改阈值：

| 参数 | 说明 |
|------|------|
| `enable_copy_trading` | 总开关；关闭后引擎只检测不下单 |
| 单笔上下限（USD） | `min_order_usd` / `max_order_usd` |
| 日成交上限 | `max_daily_volume_usd` |
| 日亏损 Kill Switch | `daily_loss_cap_pct` + `starting_capital_usd` |
| 最大持仓市场数 | `max_open_markets` |
| 单 token 持仓上限 | `max_position_per_token_usd`（0 = 不限制） |
| 滑点容忍 | `slippage_tolerance`（也可在 **执行** 标签调整） |

保存后立即生效，无需重启。

---

## 执行

控制下单行为：

| 参数 | 说明 |
|------|------|
| `order_type` | `GTC`（限价挂单）或 `FAK`（立即成交或取消） |
| 滑点 | 限价相对 Leader 价格的容忍度 |
| `gtc_fill_timeout_ms` | GTC 首次等待成交时间；超时后未成交部分进入 **订单** 页 Pending |
| `pending_order_max_age_hours` | Pending 订单最长跟踪时间 |
| 买入去重窗口 | 同一 token 重复 BUY 间隔 |
| 成交聚合窗口 | 短时间多笔合并（0 = 关闭） |
| `retry_limit` | 下单失败重试次数 |

一般保持默认，遇到频繁 Partial fill 或重复跟单时再调整。

---

## 冲突

多个 Leader 对 **同一市场** 给出相反方向时：

| 模式 | 行为 |
|------|------|
| 优先级 | 按 Leader 权重 / 列表顺序取优先 |
| 跳过 | 不跟任何一方 |
| 允许 | 可能产生对冲（谨慎） |

`priority` 列表可在设置中调整 Leader 顺序。

---

## 通知

配置 Telegram Bot 推送：

| 项 | 说明 |
|----|------|
| 启用 | 开关通知 |
| Token / Chat ID | 写在 `.env`，界面不回显 |

适合 Kill Switch 触发、大额跟单等告警。

---

## 网络

Polymarket API 在部分网络需代理才能访问。

### 配置步骤

1. 选择模式：`none` / `static` / `dynamic`
2. 填写代理 URL（如 `http://user:pass@host:port`）
3. 点击 **测试连接**
4. 保存

### 优先级

```
config.yaml 代理配置  >  .env HTTPS_PROXY  >  无代理
```

影响范围：发现页、PnL、Leader 解析、CLOB 请求等所有外网调用。

---

## 模式

- 显示当前 Preview / Live 状态
- 提供切换按钮（Live 需二次确认）
- 显示 Live 环境变量是否已配置

切换模式后 **总览** 与 **我的账户** 徽章同步更新。

---

## 配置重载

| 操作 | 是否自动重载 |
|------|-------------|
| Dashboard 保存设置 | ✓ 是 |
| 手改 config.yaml | 需 SIGHUP 或重启 `npm run dev` |
| 手改 .env 钱包 | 通过 **我的账户** 编辑，或重启 |
