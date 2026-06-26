import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type AuditRow, type DailyStatsResponse, type StatusResponse } from "../api/client";
import { DataCard } from "../components/ui/DataCard";
import { PageHeader } from "../components/ui/PageHeader";
import { OverviewHourlyChart } from "../components/OverviewHourlyChart";
import { useT } from "../i18n/I18nProvider";
import { actionBadgeClass, SideBadge } from "../utils/auditDisplay";
import { StopCopyTradingButton } from "../components/StopCopyTradingButton";

function fmtUsd(n: number) {
  const sign = n >= 0 ? "" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function OverviewPage() {
  const t = useT();
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => apiFetch<StatusResponse>("/api/status"),
    refetchInterval: 5000,
  });

  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => apiFetch<DailyStatsResponse>("/api/stats/daily"),
    refetchInterval: 10000,
  });

  const audit = useQuery({
    queryKey: ["audit-recent"],
    queryFn: () => apiFetch<{ items: AuditRow[] }>("/api/audit?limit=15"),
    refetchInterval: 5000,
  });

  const s = status.data;
  const today = stats.data?.today;
  const pnl = today?.realizedPnl ?? 0;

  return (
    <>
      <PageHeader
        title={
          s?.accountLabel
            ? t("overview.titleWithAccount", { account: s.accountLabel })
            : t("overview.title")
        }
        subtitle={t("overview.subtitle")}
        badges={
          s ? (
            <>
              <span className={`badge ${s.previewMode ? "badge-preview" : "badge-live"}`}>
                {s.previewMode ? t("badge.preview") : t("badge.live")}
              </span>
              {s.killSwitchActive && <span className="badge badge-kill">{t("badge.killSwitch")}</span>}
            </>
          ) : undefined
        }
        meta={
          s ? (
            <span className="muted">{t("overview.engineUptime", { time: fmtUptime(s.uptimeSec) })}</span>
          ) : undefined
        }
        actions={
          s ? (
            <StopCopyTradingButton
              previewMode={s.previewMode}
              copyTradingEnabled={s.copyTradingEnabled}
              compact
            />
          ) : undefined
        }
      />

      {status.isError && (
        <div className="alert alert-error">
          {t("common.engineError", { message: (status.error as Error).message })}
        </div>
      )}

      {s?.accounts && s.accounts.length > 1 && (
        <section className="page-section">
          <h2 className="section-title">{t("overview.allAccounts")}</h2>
          <div className="cards">
            {s.accounts.map((a) => (
              <DataCard
                key={a.id}
                label={a.label || a.id}
                value={fmtUsd(a.todayVolumeUsd)}
                variant="accent"
                hint={
                  <>
                    <span className={`badge ${a.previewMode ? "badge-preview" : "badge-live"}`}>
                      {a.previewMode ? t("badge.previewShort") : t("badge.liveShort")}
                    </span>
                    <span className="muted">
                      {t("overview.copyHint", {
                        count: a.todayCopyCount,
                        leaders: a.enabledLeaders.length,
                      })}
                      {a.killSwitchActive ? ` · ${t("badge.killSwitch")}` : ""}
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="page-section">
        <h2 className="section-title">{t("overview.todayPerf")}</h2>
        <div className="cards">
          <DataCard label={t("overview.copyCount")} value={today?.copyCount ?? 0} />
          <DataCard label={t("overview.volume")} value={fmtUsd(today?.volumeUsd ?? 0)} variant="accent" />
          <DataCard
            label={t("overview.realizedPnl")}
            value={fmtUsd(pnl)}
            variant={pnl >= 0 ? "positive" : "negative"}
          />
          <DataCard
            label={t("overview.pendingGtc")}
            value={s?.pendingOrders ?? 0}
            linkTo={(s?.pendingOrders ?? 0) > 0 ? "/orders" : undefined}
            linkLabel={t("common.view")}
          />
          <DataCard
            label={t("overview.enabledLeaders")}
            value={s?.enabledLeaders.length ?? 0}
            linkTo="/leaders"
            linkLabel={t("common.manage")}
          />
          <DataCard label={t("overview.lastPollCopy")} value={s?.lastPoll?.copied ?? 0} />
        </div>
      </section>

      <section className="page-section">
        <OverviewHourlyChart />
      </section>

      <section className="page-section">
        <h2 className="section-title">{t("overview.pollEngine")}</h2>
        <div className="panel panel-inset">
          <div className="engine-stats">
            <div className="engine-stat">
              <span className="engine-stat-label">{t("overview.lastPoll")}</span>
              <span className="engine-stat-value">{fmtTime(s?.lastPollAt ?? null)}</span>
            </div>
            {s?.lastPoll && (
              <>
                <div className="engine-stat">
                  <span className="engine-stat-label">Fetched</span>
                  <span className="engine-stat-value mono">{s.lastPoll.fetched}</span>
                </div>
                <div className="engine-stat">
                  <span className="engine-stat-label">Copied</span>
                  <span className="engine-stat-value mono engine-stat-good">{s.lastPoll.copied}</span>
                </div>
                <div className="engine-stat">
                  <span className="engine-stat-label">Skipped</span>
                  <span className="engine-stat-value mono">{s.lastPoll.skipped}</span>
                </div>
                <div className="engine-stat">
                  <span className="engine-stat-label">Pending Filled</span>
                  <span className="engine-stat-value mono">{s.lastPoll.pendingFilled}</span>
                </div>
                {s.lastPoll.errors.length > 0 && (
                  <div className="engine-stat">
                    <span className="engine-stat-label">Errors</span>
                    <span className="engine-stat-value mono engine-stat-bad">{s.lastPoll.errors.length}</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="muted engine-db-path">DB · {s?.dbPath ?? t("common.none")}</div>
        </div>
      </section>

      <section className="page-section">
        <div className="section-header-row">
          <h2 className="section-title">{t("overview.recentActivity")}</h2>
          <Link to="/activity" className="card-link">
            {t("common.viewAll")}
          </Link>
        </div>
        <div className="panel panel-wide">
          <table>
            <thead>
              <tr>
                <th>{t("table.time")}</th>
                <th>{t("table.leader")}</th>
                <th>{t("table.action")}</th>
                <th>{t("table.side")}</th>
                <th>{t("table.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {(audit.data?.items ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="mono">{new Date(row.ts).toLocaleTimeString()}</td>
                  <td>{row.leaderId ?? t("common.none")}</td>
                  <td>
                    <span className={actionBadgeClass(row.action)}>{row.action}</span>
                  </td>
                  <td>
                    <SideBadge side={row.side} />
                  </td>
                  <td className="mono table-cell-detail">
                    {row.action === "COPY" && row.size != null
                      ? `${row.size} @ ${row.price}`
                      : row.reason?.slice(0, 48) ?? t("common.none")}
                    {row.preview && <span className="badge badge-preview badge-xs">P</span>}
                  </td>
                </tr>
              ))}
              {!audit.data?.items.length && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    <span className="muted">{t("overview.noAudit")}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
