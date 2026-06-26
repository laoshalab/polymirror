## 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 20（推荐 LTS） |
| 网络 | 可访问 Polymarket API（国内常需代理） |
| 浏览器 | Chrome / Firefox / Safari 现代版本 |

---

## 安装与启动

### 首次安装

```bash
cd PolyMirror
npm install
cp .env.example .env
cp config.preview.template.yaml config.yaml
```

编辑 `.env`（最少两项）与 `config.yaml`（至少 1 个 Leader），详见 **完整说明书** 中的配置章节。

### 构建并启动 Dashboard

```bash
npm run build:dashboard   # 首次或前端有改动时执行
npm run dev               # 引擎 + Dashboard 同端口
```

访问地址由 `config.yaml` 中 `health_port` 决定，例如：

```
http://127.0.0.1:8081
```

健康检查：`http://127.0.0.1:8081/health`

### 开发模式（前后端分离）

```bash
# 终端 1：引擎 API（端口 = config.yaml 的 health_port，如 8081）
npm run dev

# 终端 2：前端热更新（Vite 默认 http://127.0.0.1:5173）
npm run dev:dashboard
```

前端通过 Vite 代理访问 `/api` 与 `/health`。若引擎端口不是默认的 `8080`，请修改 `dashboard/vite.config.ts` 中 `server.proxy` 的目标端口，与 `health_port` 保持一致。

---

## 登录与访问控制

### 未配置 Token

`.env` 中 **未设置** `DASHBOARD_TOKEN` 时，打开 Dashboard **无需登录**。

> 仅限本机或可信局域网使用；请勿将端口暴露到公网。

### 已配置 Token

在 `.env` 设置：

```bash
DASHBOARD_TOKEN=一串足够长的随机字符串
```

访问时会跳转到登录页，输入 Token 后进入控制台。

| 操作 | 说明 |
|------|------|
| 登录 | 输入与 `.env` 一致的 Token |
| 退出 | 侧边栏底部 **退出登录**，清除本地 Token |
| 轮换 Token | 修改 `.env` 后重启引擎，重新登录 |

---

## 启动后自检

| 检查项 | 方法 |
|--------|------|
| 引擎存活 | 浏览器打开 `/health` 或看 **总览** 是否加载 |
| 钱包正确 | **我的账户** 显示地址与 Polymarket 一致 |
| Leader 生效 | **Leader 管理** 至少 1 个 ✓ 启用 |
| 外网可达 | **发现 Trader** 页能加载排行榜（否则配置代理） |
| Preview 模式 | **总览** 显示 Preview 徽章 |

全部通过后，等待 Leader 有新成交，在 **活动流** 查看是否出现 `DETECT` / `COPY`。

---

## 安全须知

- Dashboard 可 **修改配置、切换 Live、写入私钥**，等同于控制平面
- 私钥只存在本地 `.env`，界面 **永不回显**
- 绑定 `127.0.0.1` 或内网；公网部署务必启用 Token + 防火墙
- 详细说明见仓库 `docs/SECURITY.md`
