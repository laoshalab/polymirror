import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSettings,
  patchGlobalSettings,
  patchTelegramSettings,
  reloadConfig,
  switchLiveMode,
  switchPreviewMode,
  testProxyConnection,
  type SettingsSnapshot,
} from "../api/settings";
import { PageHeader } from "../components/ui/PageHeader";
import { SecretInput } from "../components/SecretInput";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { useToast } from "../components/ui/Toast";
import { useT } from "../i18n/I18nProvider";
import { translateApiMessage } from "../i18n/apiMessages";

const DEFAULT_PROXY: SettingsSnapshot["global"]["proxy"] = {
  mode: "none",
  staticUrl: "",
  dynamicUrl: "",
  staticUrlConfigured: false,
  dynamicUrlConfigured: false,
  dynamicRotateSession: true,
};

const DEFAULT_ENV_PROXY: SettingsSnapshot["env"]["proxy"] = {
  configured: false,
  mode: "none",
  source: "none",
  urlMasked: "",
  envFallback: false,
};

type Tab = "global" | "risk" | "execution" | "conflict" | "notify" | "network" | "mode";

export function SettingsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const tabs = useMemo(
    (): { id: Tab; label: string }[] => [
      { id: "global", label: t("settings.tabGlobal") },
      { id: "risk", label: t("settings.tabRisk") },
      { id: "execution", label: t("settings.tabExecution") },
      { id: "conflict", label: t("settings.tabConflict") },
      { id: "notify", label: t("settings.tabNotify") },
      { id: "network", label: t("settings.tabNetwork") },
      { id: "mode", label: t("settings.tabMode") },
    ],
    [t]
  );
  const [tab, setTab] = useState<Tab>("global");
  const [form, setForm] = useState<SettingsSnapshot["global"] | null>(null);
  const [priorityText, setPriorityText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  useEffect(() => {
    if (data?.global) {
      const g = JSON.parse(JSON.stringify(data.global)) as SettingsSnapshot["global"];
      g.proxy = { ...DEFAULT_PROXY, ...g.proxy, staticUrl: "", dynamicUrl: "" };
      setForm(g);
      setPriorityText((g.conflict.priority ?? []).join(", "));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("No form");
      const body: Record<string, unknown> = {
        pollIntervalMs: form.pollIntervalMs,
        activityLimit: form.activityLimit,
        copyTradesOnly: form.copyTradesOnly,
        maxTradeAgeHours: form.maxTradeAgeHours,
        buyDedupWindowMs: form.buyDedupWindowMs,
        tradeAggregationWindowMs: form.tradeAggregationWindowMs,
        healthPort: form.healthPort,
        risk: form.risk,
        execution: form.execution,
        conflict: {
          mode: form.conflict.mode,
          priority: priorityText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        notify: form.notify,
      };
      return patchGlobalSettings(body);
    },
    onSuccess: () => {
      toast(t("settings.saved"), "success");
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["risk"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const toPreview = useMutation({
    mutationFn: switchPreviewMode,
    onSuccess: (r) => {
      toast(translateApiMessage(t, r.message), "success");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const toLive = useMutation({
    mutationFn: switchLiveMode,
    onSuccess: (r) => {
      toast(translateApiMessage(t, r.message), "success");
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (e: Error) => {
      setErr(e.message);
      toast(t("settings.liveSwitchFailed", { message: e.message }), "error");
    },
  });

  const reload = useMutation({
    mutationFn: reloadConfig,
    onSuccess: () => toast(t("settings.reloaded"), "success"),
    onError: (e: Error) => setErr(e.message),
  });

  const saveProxy = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("No form");
      const proxy: Record<string, unknown> = {
        mode: form.proxy.mode,
        dynamicRotateSession: form.proxy.dynamicRotateSession,
      };
      if (form.proxy.staticUrl.trim()) proxy.staticUrl = form.proxy.staticUrl.trim();
      if (form.proxy.dynamicUrl.trim()) proxy.dynamicUrl = form.proxy.dynamicUrl.trim();
      return patchGlobalSettings({ proxy });
    },
    onSuccess: () => {
      toast(t("settings.proxySaved"), "success");
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const testProxy = useMutation({
    mutationFn: testProxyConnection,
    onSuccess: (r) => {
      if (r.ok) {
        toast(translateApiMessage(t, r.message ?? t("settings.proxyOk")), "success");
        setErr(null);
      } else {
        setErr([r.error, r.hint].filter(Boolean).join(" — "));
      }
    },
    onError: (e: Error) => setErr(e.message),
  });

  const saveTelegram = useMutation({
    mutationFn: () => {
      const body: { botToken?: string; chatId?: string } = {};
      if (tgToken.trim()) body.botToken = tgToken.trim();
      if (tgChatId.trim()) body.chatId = tgChatId.trim();
      if (Object.keys(body).length === 0) {
        throw new Error(t("settings.telegramRequireOne"));
      }
      return patchTelegramSettings(body);
    },
    onSuccess: (r) => {
      toast(translateApiMessage(t, r.message), "success");
      setErr(null);
      setTgToken("");
      setTgChatId("");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  function setProxy<K extends keyof SettingsSnapshot["global"]["proxy"]>(
    key: K,
    value: SettingsSnapshot["global"]["proxy"][K]
  ) {
    setForm((f) => f && { ...f, proxy: { ...f.proxy, [key]: value } });
  }

  function setRisk<K extends keyof SettingsSnapshot["global"]["risk"]>(
    key: K,
    value: SettingsSnapshot["global"]["risk"][K]
  ) {
    setForm((f) => f && { ...f, risk: { ...f.risk, [key]: value } });
  }

  function setGlobal<K extends keyof SettingsSnapshot["global"]>(
    key: K,
    value: SettingsSnapshot["global"][K]
  ) {
    setForm((f) => f && { ...f, [key]: value });
  }

  if (isLoading || !form || !data) {
    return (
      <>
        <PageHeader title={t("settings.title")} subtitle={t("settings.loading")} />
        <div className="skeleton skeleton-title" style={{ maxWidth: 320 }} />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title={t("settings.title")} />
        <div className="alert alert-error">{(error as Error).message}</div>
      </>
    );
  }

  const p = data.env.proxy ?? DEFAULT_ENV_PROXY;
  const canSwitchLive =
    data.previewMode && (data.env.liveConfirmSet || !data.env.requireLiveConfirm);
  const proxyStatusLabel = !p.configured
    ? p.envFallback
      ? t("settings.proxyStatusEnvDisabled")
      : t("settings.proxyStatusNone")
    : `${p.mode === "static" ? t("settings.proxyStatusStatic") : p.mode === "dynamic" ? t("settings.proxyStatusDynamic") : t("settings.proxyStatusDirect")}${
        p.source === "env" ? t("settings.proxySourceEnv") : p.source === "yaml" ? t("settings.proxySourceYaml") : ""
      }${p.urlMasked ? ` · ${p.urlMasked}` : ""}`;

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        badges={
          <span className={`badge ${data.previewMode ? "badge-preview" : "badge-live"}`}>
            {data.previewMode ? t("badge.previewShort") : t("badge.liveShort")}
          </span>
        }
      />

      {err && <div className="alert alert-error">{err}</div>}

      <div className="settings-env panel panel-inset" style={{ marginBottom: "1.25rem" }}>
        <div className="settings-env-grid">
          <span>{t("settings.envWallet")}</span>
          <span className="mono">{data.env.walletAddress}</span>
          <span>{t("settings.envTelegram")}</span>
          <span>
            {data.env.telegramConfigured ? t("settings.configured") : t("settings.notConfigured")}
          </span>
          <span>{t("settings.envLiveConfirm")}</span>
          <span>
            {data.env.liveConfirmSet ? t("settings.liveConfirmSet") : t("settings.liveConfirmUnset")}
          </span>
          <span>{t("settings.envProxy")}</span>
          <span>{proxyStatusLabel}</span>
          <span>{t("settings.envConfig")}</span>
          <span className="mono muted">{data.configPath}</span>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-tabs-vertical" aria-label={t("settings.title")}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-tab ${tab === item.id ? "settings-tab-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="form-panel settings-form">
        {tab === "global" && (
          <>
            <p className="muted form-hint">{t("settings.pollIntervalHint")}</p>
            <div className="form-row">
              <label className="form-label">
                poll_interval_ms
                <input
                  type="number"
                  value={form.pollIntervalMs}
                  onChange={(e) => setGlobal("pollIntervalMs", parseInt(e.target.value, 10))}
                />
              </label>
              <label className="form-label">
                activity_limit
                <input
                  type="number"
                  value={form.activityLimit}
                  onChange={(e) => setGlobal("activityLimit", parseInt(e.target.value, 10))}
                />
              </label>
              <label className="form-label">
                health_port
                <input
                  type="number"
                  value={form.healthPort}
                  onChange={(e) => setGlobal("healthPort", parseInt(e.target.value, 10))}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                max_trade_age_hours
                <input
                  type="number"
                  step="0.1"
                  value={form.maxTradeAgeHours}
                  onChange={(e) => setGlobal("maxTradeAgeHours", parseFloat(e.target.value))}
                />
              </label>
              <label className="form-label">
                trade_aggregation_window_ms
                <input
                  type="number"
                  value={form.tradeAggregationWindowMs}
                  onChange={(e) =>
                    setGlobal("tradeAggregationWindowMs", parseInt(e.target.value, 10))
                  }
                />
              </label>
            </div>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.copyTradesOnly}
                onChange={(e) => setGlobal("copyTradesOnly", e.target.checked)}
              />
              {t("settings.copyTradesOnlyLabel")}
            </label>
          </>
        )}

        {tab === "risk" && (
          <>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.risk.enableCopyTrading}
                onChange={(e) => setRisk("enableCopyTrading", e.target.checked)}
              />
              enable_copy_trading
            </label>
            <div className="form-row">
              <label className="form-label">
                daily_loss_cap_pct
                <input
                  type="number"
                  value={form.risk.dailyLossCapPct}
                  onChange={(e) => setRisk("dailyLossCapPct", parseFloat(e.target.value))}
                />
              </label>
              <label className="form-label">
                starting_capital_usd
                <input
                  type="number"
                  value={form.risk.startingCapitalUsd}
                  onChange={(e) => setRisk("startingCapitalUsd", parseFloat(e.target.value))}
                />
              </label>
              <label className="form-label">
                max_daily_volume_usd
                <input
                  type="number"
                  value={form.risk.maxDailyVolumeUsd}
                  onChange={(e) => setRisk("maxDailyVolumeUsd", parseFloat(e.target.value))}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                max_open_markets
                <input
                  type="number"
                  value={form.risk.maxOpenMarkets}
                  onChange={(e) => setRisk("maxOpenMarkets", parseInt(e.target.value, 10))}
                />
              </label>
              <label className="form-label">
                max_order_usd
                <input
                  type="number"
                  value={form.risk.maxOrderUsd}
                  onChange={(e) => setRisk("maxOrderUsd", parseFloat(e.target.value))}
                />
              </label>
              <label className="form-label">
                min_order_usd
                <input
                  type="number"
                  value={form.risk.minOrderUsd}
                  onChange={(e) => setRisk("minOrderUsd", parseFloat(e.target.value))}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                slippage_tolerance
                <input
                  type="number"
                  step="0.01"
                  value={form.risk.slippageTolerance}
                  onChange={(e) => setRisk("slippageTolerance", parseFloat(e.target.value))}
                />
              </label>
              <label className="form-label">
                {t("settings.maxPositionPerTokenLabel")}
                <input
                  type="number"
                  value={form.risk.maxPositionPerTokenUsd}
                  onChange={(e) => setRisk("maxPositionPerTokenUsd", parseFloat(e.target.value))}
                />
              </label>
            </div>
            <label className="form-label">
              {t("settings.positionCapBasisLabel")}
              <select
                value={form.risk.positionCapBasis}
                onChange={(e) =>
                  setRisk("positionCapBasis", e.target.value as "market" | "cost")
                }
              >
                <option value="market">{t("settings.positionCapMarket")}</option>
                <option value="cost">{t("settings.positionCapCost")}</option>
              </select>
            </label>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.risk.syncWalletBalance}
                onChange={(e) => setRisk("syncWalletBalance", e.target.checked)}
              />
              {t("settings.syncWalletBalanceLabel")}
            </label>
          </>
        )}

        {tab === "execution" && (
          <div className="form-row">
            <label className="form-label">
              order_type
              <select
                value={form.execution.orderType}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, execution: { ...f.execution, orderType: e.target.value } } : f
                  )
                }
              >
                <option value="GTC">GTC</option>
                <option value="FAK">FAK</option>
                <option value="FOK">FOK</option>
              </select>
            </label>
            <label className="form-label">
              retry_limit
              <input
                type="number"
                value={form.execution.retryLimit}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, execution: { ...f.execution, retryLimit: parseInt(e.target.value, 10) } }
                      : f
                  )
                }
              />
            </label>
            <label className="form-label">
              gtc_fill_timeout_ms
              <input
                type="number"
                value={form.execution.gtcFillTimeoutMs}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          execution: { ...f.execution, gtcFillTimeoutMs: parseInt(e.target.value, 10) },
                        }
                      : f
                  )
                }
              />
            </label>
          </div>
        )}

        {tab === "conflict" && (
          <>
            <label className="form-label">
              conflict.mode
              <select
                value={form.conflict.mode}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, conflict: { ...f.conflict, mode: e.target.value } } : f
                  )
                }
              >
                <option value="priority_leader">priority_leader</option>
                <option value="skip_both">skip_both</option>
                <option value="net">net</option>
              </select>
            </label>
            <label className="form-label">
              {t("settings.priorityLabel")}
              <input
                type="text"
                value={priorityText}
                onChange={(e) => setPriorityText(e.target.value)}
                placeholder="swisstony, endlessFate"
              />
            </label>
          </>
        )}

        {tab === "notify" && (
          <>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.notify.telegramOnCopy}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, notify: { ...f.notify, telegramOnCopy: e.target.checked } } : f
                  )
                }
              />
              telegram_on_copy
            </label>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.notify.telegramOnError}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, notify: { ...f.notify, telegramOnError: e.target.checked } } : f
                  )
                }
              />
              telegram_on_error
            </label>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.notify.telegramOnKillSwitch}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, notify: { ...f.notify, telegramOnKillSwitch: e.target.checked } }
                      : f
                  )
                }
              />
              telegram_on_kill_switch
            </label>
            <div className="settings-divider" style={{ margin: "1.25rem 0 0.75rem" }} />
            <h3 className="account-card-title">{t("settings.telegramCredentialsTitle")}</h3>
            <p className="muted form-hint">
              {t("settings.telegramStatus", {
                tokenStatus: data.env.telegramTokenSet ? t("settings.configured") : t("settings.notConfigured"),
                chatStatus: data.env.telegramChatSet ? t("settings.configured") : t("settings.notConfigured"),
                enabledSuffix: data.env.telegramConfigured ? t("settings.telegramEnabledSuffix") : "",
              })}
            </p>
            <label className="form-label">
              Bot Token
              <SecretInput
                value={tgToken}
                onChange={setTgToken}
                placeholder={
                  data.env.telegramTokenSet
                    ? t("settings.telegramTokenPlaceholderConfigured")
                    : "123456789:AA..."
                }
                autoComplete="new-password"
              />
            </label>
            <label className="form-label">
              Chat ID
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder={
                  data.env.telegramChatSet
                    ? t("settings.telegramChatPlaceholderConfigured")
                    : t("settings.telegramChatPlaceholder")
                }
                className="mono"
              />
            </label>
            <div className="form-actions" style={{ marginTop: "1rem" }}>
              <button type="button" disabled={saveTelegram.isPending} onClick={() => saveTelegram.mutate()}>
                {saveTelegram.isPending ? t("settings.saving") : t("settings.saveTelegram")}
              </button>
            </div>
            <p className="muted form-hint">{t("settings.telegramEnvHint")}</p>
          </>
        )}

        {tab === "network" && form.proxy && (
          <>
            <p className="muted form-hint">{t("settings.networkHint")}</p>
            <label className="form-label">
              {t("settings.proxyModeLabel")}
              <select
                value={form.proxy.mode}
                onChange={(e) =>
                  setProxy("mode", e.target.value as SettingsSnapshot["global"]["proxy"]["mode"])
                }
              >
                <option value="none">{t("settings.proxyNone")}</option>
                <option value="static">{t("settings.proxyStatic")}</option>
                <option value="dynamic">{t("settings.proxyDynamic")}</option>
              </select>
            </label>

            {form.proxy.mode === "static" && (
              <>
                {form.proxy.staticUrlConfigured && data.env.proxy.urlMasked && (
                  <p className="muted form-hint">
                    {t("settings.proxyCurrentMasked", { url: data.env.proxy.urlMasked })}
                  </p>
                )}
                <label className="form-label">
                  {t("settings.proxyStaticUrlLabel")}
                  <input
                    type="text"
                    value={form.proxy.staticUrl}
                    onChange={(e) => setProxy("staticUrl", e.target.value)}
                    placeholder={t("settings.proxyStaticPlaceholder")}
                    className="mono"
                  />
                </label>
              </>
            )}

            {form.proxy.mode === "dynamic" && (
              <>
                {form.proxy.dynamicUrlConfigured && data.env.proxy.urlMasked && (
                  <p className="muted form-hint">
                    {t("settings.proxyCurrentMasked", { url: data.env.proxy.urlMasked })}
                  </p>
                )}
                <label className="form-label">
                  {t("settings.proxyDynamicUrlLabel")}
                  <input
                    type="text"
                    value={form.proxy.dynamicUrl}
                    onChange={(e) => setProxy("dynamicUrl", e.target.value)}
                    placeholder={t("settings.proxyDynamicPlaceholder")}
                    className="mono"
                  />
                </label>
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={form.proxy.dynamicRotateSession}
                    onChange={(e) => setProxy("dynamicRotateSession", e.target.checked)}
                  />
                  {t("settings.proxyRotateSession")}
                </label>
              </>
            )}

            <div className="form-actions" style={{ marginTop: "1rem" }}>
              <button type="button" disabled={saveProxy.isPending} onClick={() => saveProxy.mutate()}>
                {saveProxy.isPending ? t("settings.saving") : t("settings.saveProxy")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={testProxy.isPending}
                onClick={() => testProxy.mutate()}
              >
                {testProxy.isPending ? t("settings.testingProxy") : t("settings.testProxy")}
              </button>
            </div>

            <p className="muted form-hint">{t("settings.proxyEnvFallback")}</p>
          </>
        )}

        {tab === "mode" && (
          <>
            <p className="muted">
              {t("settings.currentMode", {
                mode: data.previewMode ? t("settings.modePreview") : t("settings.modeLive"),
              })}
            </p>
            {!data.env.liveConfirmSet && data.env.requireLiveConfirm && data.previewMode && (
              <div className="alert alert-warn" style={{ marginBottom: "1rem" }}>
                {t("settings.liveBlocked")}
              </div>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                disabled={toPreview.isPending || data.previewMode}
                onClick={() => toPreview.mutate()}
              >
                {t("settings.toPreview")}
              </button>
              <button
                type="button"
                disabled={toLive.isPending || !canSwitchLive}
                onClick={() => setConfirmLive(true)}
              >
                {t("settings.toLive")}
              </button>
            </div>
            <p className="muted form-hint">{t("settings.modeHint")}</p>
          </>
        )}

        {tab !== "mode" && tab !== "network" && (
          <div className="form-actions" style={{ marginTop: "1.25rem" }}>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t("settings.saving") : t("settings.saveSettings")}
            </button>
            <button type="button" className="secondary" disabled={reload.isPending} onClick={() => reload.mutate()}>
              {t("settings.reloadDisk")}
            </button>
          </div>
        )}
        </div>
      </div>

      <ConfirmModal
        open={confirmLive}
        title={t("settings.confirmLiveTitle")}
        variant="danger"
        confirmLabel={t("settings.confirmLiveBtn")}
        loading={toLive.isPending}
        description={
          <>
            <p style={{ margin: "0 0 0.75rem" }}>{t("settings.confirmLiveP1")}</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--text-secondary)" }}>
              <li>{t("settings.confirmLiveLi1")}</li>
              <li>{t("settings.confirmLiveLi2")}</li>
              <li>{t("settings.confirmLiveLi3")}</li>
            </ul>
          </>
        }
        onConfirm={() => {
          toLive.mutate(undefined, { onSettled: () => setConfirmLive(false) });
        }}
        onCancel={() => setConfirmLive(false)}
      />
    </>
  );
}
