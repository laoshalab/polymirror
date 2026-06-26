## 安装与访问

### Dashboard 打不开 / 404

| 可能原因 | 处理 |
|----------|------|
| 未构建前端 | 运行 `npm run build:dashboard` |
| 端口不对 | 查看 `config.yaml` 的 `health_port` |
| 进程未启动 | 运行 `npm run dev` |
| 端口被占用 | 结束旧进程或改端口 |

### 登录 Token 无效

- 确认 `.env` 中 `DASHBOARD_TOKEN` 与输入完全一致
- 修改 Token 后需 **重启引擎**
- 清除浏览器缓存或使用无痕模式重试

---

## 网络与 API

### 发现页 / PnL 加载失败、超时

**最常见原因：** 无法访问 Polymarket API。

1. **设置 → 网络** 配置 static / dynamic 代理
2. 或在 `.env` 设置 `HTTPS_PROXY=http://…`
3. 点击 **测试连接** 确认通过
4. 刷新页面

### 钱包资料报错

1. **我的账户 → 编辑** 核对 Proxy 地址
2. Proxy ≠ EOA 时签名类型应为 **1**
3. 更换私钥后保存并刷新
4. 确认 `.env` 中对应变量已写入

---

## 跟单行为

### 活动流没有任何记录

| 检查项 | 操作 |
|--------|------|
| Leader 未启用 | Leaders 页确认 ✓ |
| 账户被禁用 | 我的账户 → 编辑 → 启用 |
| Leader 无新成交 | 等待或换活跃 Leader |
| 轮询间隔过长 | 设置 → 全局，暂调小 interval |

### 只有 DETECT，没有 COPY

查看同一条的 **原因** 或筛选 `SKIP`：

- 价格不在 min/max 范围 → 调整 Leader 过滤
- 低于 min_order → 提高比例
- Kill Switch → 风控页处理

### Preview 有 COPY，Live 没有

- 确认 **设置 → 模式** 已切 Live
- 确认 `.env` 有 `POLYMIRROR_LIVE_CONFIRM`
- 确认钱包 USDC 余额充足
- 查看活动流 `ERROR` 记录

---

## 多账户

### 改了 Leader 但另一个账户还在跟

每个账户 Leader **独立配置**。确认侧边栏已切换到目标账户后再修改。

### 如何删除账户

当前版本不支持界面删除。可手动：

1. `config.yaml` 移除对应 `accounts[]` 项
2. 可选：删除 `data/accounts/{id}/` 与 `.env` 中对应变量
3. 重启引擎

---

## 配置与数据

### Dashboard 保存后未生效

- 正常情况下会自动热重载
- 若异常：重启 `npm run dev`
- 手改 YAML 不会自动生效，需重启或 SIGHUP

### Preview 与 Live 数据在哪

| 模式 | 数据库路径（典型） |
|------|-------------------|
| Preview | `data/preview.db` 或 `data/accounts/{id}/preview.db` |
| Live | `data/polymirror.db` 或账户子目录 |

---

## 获取进一步帮助

| 文档 | 适用场景 |
|------|----------|
| **速查表** | 命令、参数一页参考 |
| **完整说明书** | CLI 安装、Docker、实盘上线 |
| **RUNBOOK.md** | 运维与故障排查 |
| **SECURITY.md** | 安全与 Token 配置 |
