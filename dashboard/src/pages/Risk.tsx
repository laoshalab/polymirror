import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchRisk, resetKillSwitch, type RiskSnapshot } from "../api/settings";
import { DataCard } from "../components/ui/DataCard";
import { PageHeader } from "../components/ui/PageHeader";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { useToast } from "../components/ui/Toast";
import { StopCopyTradingButton } from "../components/StopCopyTradingButton";
import { useT } from "../i18n/I18nProvider";

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const warn = pct >= 80;
  return (
    <div className="progress-block">
      <div className="progress-head">
        <span>{label}</span>
        <span className="mono">
          ${value.toFixed(2)} / ${max.toFixed(2)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${warn ? "progress-warn" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CountBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div className="progress-block">
      <div className="progress-head">
        <span>{label}</span>
        <span>
          {current} / {max} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function RiskPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmKill, setConfirmKill] = useState(false);

  const { data, isError, error } = useQuery({
    queryKey: ["risk"],
    queryFn: fetchRisk,
    refetchInterval: 5000,
  });

  const reset = useMutation({
    mutationFn: resetKillSwitch,
    onSuccess: () => {
      toast(t("risk.killReset"), "success");
      queryClient.invalidateQueries({ queryKey: ["risk"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  function onResetKillSwitch() {
    setConfirmKill(true);
  }

  function confirmResetKill() {
    reset.mutate(undefined, { onSettled: () => setConfirmKill(false) });
  }

  if (isError) {
    return (
      <>
        <PageHeader title={t("risk.title")} subtitle={t("risk.subtitle")} />
        <div className="alert alert-error">{(error as Error).message}</div>
      </>
    );
  }

  const r = data as RiskSnapshot | undefined;
  const pnl = r?.daily.realizedPnl ?? 0;

  return (
    <>
      <PageHeader
        title={t("risk.title")}
        subtitle={t("risk.subtitle")}
        badges={
          r ? (
            <>
              <span className={`badge ${r.previewMode ? "badge-preview" : "badge-live"}`}>
                {r.previewMode ? t("badge.previewShort") : t("badge.liveShort")}
              </span>
              {r.killSwitchActive && <span className="badge badge-kill">{t("badge.killSwitch")}</span>}
            </>
          ) : undefined
        }
        actions={
          r ? (
            <StopCopyTradingButton
              previewMode={r.previewMode}
              copyTradingEnabled={r.copyTradingEnabled}
            />
          ) : undefined
        }
      />

      {r?.killSwitchActive && (
        <div className="alert alert-error kill-banner">
          <strong>{t("risk.killBanner")}</strong> — {t("risk.killBannerDesc")}
          <button type="button" className="secondary" disabled={reset.isPending} onClick={onResetKillSwitch}>
            {t("risk.resetKill")}
          </button>
        </div>
      )}

      <section className="page-section">
        <div className="cards">
          <DataCard
            label={t("risk.mode")}
            value={r?.previewMode ? t("badge.previewShort") : t("badge.liveShort")}
            variant={r?.previewMode ? "default" : "positive"}
          />
          <DataCard
            label={t("risk.copySwitch")}
            value={r?.copyTradingEnabled ? t("common.on") : t("common.off")}
            variant={r?.copyTradingEnabled ? "positive" : "default"}
          />
          <DataCard
            label={t("risk.todayPnl")}
            value={`$${pnl.toFixed(2)}`}
            variant={pnl >= 0 ? "positive" : "negative"}
          />
          <DataCard
            label={t("risk.lossRatio")}
            value={`${(r?.daily.lossPct ?? 0).toFixed(1)}% / ${r?.daily.dailyLossCapPct ?? 0}%`}
          />
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">{t("risk.limitProgress")}</h2>
        <div className="panel panel-inset">
          {r && (
            <>
              <ProgressBar
                value={r.daily.volumeUsd}
                max={r.daily.maxDailyVolumeUsd}
                label={t("risk.globalVolume")}
              />
              <CountBar
                current={r.openMarkets.current}
                max={r.openMarkets.max}
                label={t("risk.openMarkets")}
              />
              {r.daily.realizedPnl < 0 && (
                <ProgressBar
                  value={Math.abs(r.daily.realizedPnl)}
                  max={(r.daily.startingCapitalUsd * r.daily.dailyLossCapPct) / 100}
                  label={t("risk.lossCap")}
                />
              )}
            </>
          )}
        </div>
      </section>

      {r?.walletDrifts && r.walletDrifts.length > 0 && (
        <div className="alert alert-warn">
          {t("statusBar.drift", { count: r.walletDrifts.length })}: {r.walletDrifts.join(" · ")}
          <Link to="/positions" className="status-bar-link">
            {t("statusBar.viewPositions")}
          </Link>
        </div>
      )}

      <section className="page-section">
        <h2 className="section-title">{t("risk.leaderVolume")}</h2>
        <div className="panel panel-wide">
          <table>
            <thead>
              <tr>
                <th>{t("table.leader")}</th>
                <th>{t("common.enabled")}</th>
                <th>{t("table.volume")}</th>
                <th>{t("risk.dailyCap")}</th>
              </tr>
            </thead>
            <tbody>
              {(r?.leaderVolumes ?? []).map((l) => (
                <tr key={l.leaderId}>
                  <td>{l.leaderId}</td>
                  <td>{l.enabled ? <span className="action-badge action-copy">ON</span> : t("common.none")}</td>
                  <td className="mono">${l.volumeUsd.toFixed(2)}</td>
                  <td>{l.maxDailyVolumeUsd != null ? `$${l.maxDailyVolumeUsd}` : t("common.none")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">{t("risk.tokenConc")}</h2>
        <div className="panel panel-wide">
          <table>
            <thead>
              <tr>
                <th>{t("table.token")}</th>
                <th>{t("table.shares")}</th>
                <th>{t("risk.exposure")}</th>
                <th>{t("risk.cap")}</th>
              </tr>
            </thead>
            <tbody>
              {(r?.tokenExposure ?? []).map((row) => (
                <tr key={row.tokenId}>
                  <td className="mono">{row.tokenId.slice(0, 12)}…</td>
                  <td>{row.shares.toFixed(4)}</td>
                  <td className="mono">${row.exposureUsd.toFixed(2)}</td>
                  <td>{row.capUsd != null ? `$${row.capUsd}` : t("risk.uncapped")}</td>
                </tr>
              ))}
              {!r?.tokenExposure.length && (
                <tr>
                  <td colSpan={4} className="table-empty">
                    <span className="muted">{t("risk.noPositions")}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="muted form-hint">{t("risk.settingsHint")}</p>

      <ConfirmModal
        open={confirmKill}
        title={t("risk.confirmKillTitle")}
        variant="danger"
        confirmLabel={t("risk.confirmKillBtn")}
        loading={reset.isPending}
        description={
          <>
            {t("risk.confirmKillDesc")}
            <br />
            <span className="muted">{t("risk.confirmKillHint")}</span>
          </>
        }
        onConfirm={confirmResetKill}
        onCancel={() => setConfirmKill(false)}
      />
    </>
  );
}
