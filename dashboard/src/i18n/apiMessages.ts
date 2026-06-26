type TFn = (key: string, vars?: Record<string, string | number>) => string;

const EXACT: Record<string, string> = {
  "连接成功": "apiMsg.proxyOk",
  "账户信息已更新。": "apiMsg.accountUpdated",
  "账户已创建。私钥已写入 .env，不会在此显示。切换账户后即可配置 Leader。": "apiMsg.accountCreated",
  "账户已更新，私钥已写入 .env（不会在此显示）。": "apiMsg.accountUpdatedWithKey",
  "Telegram 凭证已保存到 .env（不会回显）。重启引擎后通知即使用新凭证。": "apiMsg.telegramSaved",
  "订单已从 CLOB 撤销并移出 pending 列表": "apiMsg.orderCancelled",
  "已停止跟单：Preview 模式，跟单开关已关闭。": "apiMsg.stopCopy",
  "无法拉取 Trader 详情，请检查网络或 HTTPS_PROXY": "apiMsg.traderFetchFailed",
  "无法连接 Polymarket Data API。请在「设置 → 网络」配置代理，或在 .env 设置 HTTPS_PROXY。": "apiMsg.dataApiFailed",
  "无法拉取 Polymarket 盈亏曲线。请在「设置 → 网络」配置代理。": "apiMsg.pnlFetchFailed",
  "代理连接失败，请检查地址、端口或认证信息": "apiMsg.proxyConnectFailed",
  "未配置代理。请在「设置 → 网络」选择固定 IP 或动态 IP 代理": "apiMsg.proxyNotConfigured",
  "未提供要更新的字段": "apiMsg.noFieldsToUpdate",
  "Bot Token 格式不正确（应形如 123456789:AA...）": "apiMsg.invalidBotToken",
  "Chat ID 应为数字（群组可为负数）": "apiMsg.invalidChatId",
};

function translateFlushNote(t: TFn, note: string): string {
  if (!note) return "";
  const m = note.match(/^已处理 (\d+) 笔 Live 挂单。$/);
  if (m) return t("apiMsg.flushResolved", { resolved: m[1]! });
  const m2 = note.match(/^已处理 (\d+) 笔 Live 挂单，仍有 (\d+) 笔未结束（请到 Polymarket 手动检查）。$/);
  if (m2) return t("apiMsg.flushPartial", { resolved: m2[1]!, remaining: m2[2]! });
  return note;
}

function translateMigrateNote(t: TFn, note: string): string {
  const m = note.match(/^已合并 Preview：(\d+) 条去重、(\d+) 条引擎持仓（仅跟踪，链上为准）。$/);
  if (m) return t("apiMsg.previewMerged", { seen: m[1]!, positions: m[2]! });
  return note;
}

function translateUnfollowMessage(t: TFn, message: string): string | null {
  const head = message.match(/^已撤销跟单：Leader ([^ ]+) 已从配置移除。/);
  if (!head) return null;

  const id = head[1]!;
  const parts = [t("apiMsg.leaderUnfollowed", { id })];

  const pending = message.match(/已撤销 (\d+) 笔挂单。/);
  if (pending) parts.push(t("apiMsg.leaderUnfollowPending", { count: pending[1]! }));

  const pendingFailed = message.match(/有 (\d+) 笔挂单未能撤销/);
  if (pendingFailed) {
    parts.push(t("apiMsg.leaderUnfollowPendingFailed", { count: pendingFailed[1]! }));
  }

  const positions = message.match(/仍有 (\d+) 条本地跟踪持仓未清空。/);
  if (positions) parts.push(t("apiMsg.leaderUnfollowPositions", { count: positions[1]! }));

  const sold = message.match(/已卖出 (\d+) 条持仓。/);
  if (sold) parts.push(t("apiMsg.leaderUnfollowSold", { count: sold[1]! }));

  const sellPending = message.match(/有 (\d+) 笔卖单挂单中/);
  if (sellPending) parts.push(t("apiMsg.leaderUnfollowSellPending", { count: sellPending[1]! }));

  const sellFailed = message.match(/(\d+) 条持仓未能卖出/);
  if (sellFailed) parts.push(t("apiMsg.leaderUnfollowSellFailed", { count: sellFailed[1]! }));

  const sellSkipped = message.match(/(\d+) 条持仓因金额过小或无余额跳过。/);
  if (sellSkipped) parts.push(t("apiMsg.leaderUnfollowSellSkipped", { count: sellSkipped[1]! }));

  return parts.join(" ");
}

export function translateApiMessage(t: TFn, message: string): string {
  if (!message) return message;

  const exactKey = EXACT[message];
  if (exactKey) return t(exactKey);

  const unfollow = translateUnfollowMessage(t, message);
  if (unfollow) return unfollow;

  const preview = message.match(/^已切换 Preview（引擎已热重载 preview\.db）。(.*)$/);
  if (preview) {
    const note = translateFlushNote(t, preview[1] ?? "");
    return note ? `${t("apiMsg.switchedPreview")} ${note}` : t("apiMsg.switchedPreview");
  }

  const live = message.match(/^已切换 Live（引擎已热重载 polymirror\.db）。(.*)请确认钱包 USDC 充足。$/);
  if (live) {
    const middle = live[1] ?? "";
    const migrate = translateMigrateNote(t, middle);
    const base = migrate ? `${t("apiMsg.switchedLive")} ${migrate}` : t("apiMsg.switchedLive");
    return `${base} ${t("apiMsg.confirmUsdc")}`;
  }

  const stop = message.match(/^已停止跟单：Preview 模式，跟单开关已关闭。(.*)$/);
  if (stop) {
    const note = translateFlushNote(t, stop[1] ?? "");
    return note ? `${t("apiMsg.stopCopy")} ${note}` : t("apiMsg.stopCopy");
  }

  if (message.includes("config.yaml 已迁移为多账户格式")) {
    return message.replace("config.yaml 已迁移为多账户格式。", t("apiMsg.configMigrated"));
  }

  return message;
}
