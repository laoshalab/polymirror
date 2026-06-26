import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import {
  type DiscoverCategory,
  type DiscoverOrderBy,
  type DiscoverResponse,
  type DiscoverTimePeriod,
  type DiscoverTraderRow,
  discoverQuery,
  formatUsd,
} from "../api/discover";
import { AddTraderModal } from "../components/AddTraderModal";
import { UnfollowLeaderButton } from "../components/UnfollowLeaderButton";
import { PageHeader } from "../components/ui/PageHeader";
import { useT } from "../i18n/I18nProvider";

export function DiscoverPage() {
  const t = useT();
  const [category, setCategory] = useState<DiscoverCategory>("OVERALL");
  const [timePeriod, setTimePeriod] = useState<DiscoverTimePeriod>("MONTH");
  const [orderBy, setOrderBy] = useState<DiscoverOrderBy>("PNL");
  const [modalTrader, setModalTrader] = useState<DiscoverTraderRow | null>(null);

  const categories = useMemo(
    () =>
      [
        { id: "OVERALL" as const, label: t("discover.catOverall") },
        { id: "POLITICS" as const, label: t("discover.catPolitics") },
        { id: "SPORTS" as const, label: t("discover.catSports") },
        { id: "CRYPTO" as const, label: t("discover.catCrypto") },
        { id: "FINANCE" as const, label: t("discover.catFinance") },
        { id: "TECH" as const, label: t("discover.catTech") },
        { id: "CULTURE" as const, label: t("discover.catCulture") },
      ] satisfies { id: DiscoverCategory; label: string }[],
    [t]
  );

  const periods = useMemo(
    () =>
      [
        { id: "MONTH" as const, label: t("discover.periodMonth") },
        { id: "WEEK" as const, label: t("discover.periodWeek") },
        { id: "ALL" as const, label: t("discover.periodAll") },
        { id: "DAY" as const, label: t("discover.periodDay") },
      ] satisfies { id: DiscoverTimePeriod; label: string }[],
    [t]
  );

  const queryKey = useMemo(() => ["discover", category, timePeriod, orderBy], [category, timePeriod, orderBy]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<DiscoverResponse>(
        discoverQuery({ category, timePeriod, orderBy, limit: 30 })
      ),
    staleTime: 60_000,
  });

  const traders = data?.traders ?? [];
  const apiError = data?.error ?? (isError ? (error as Error).message : undefined);

  return (
    <>
      <PageHeader
        title={t("discover.title")}
        subtitle={
          <>
            {t("discover.subtitle")}
            {data?.cached && <span className="discover-cache">{t("discover.cache")}</span>}
          </>
        }
        actions={
          <button type="button" className="secondary" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? t("common.refreshing") : t("common.refresh")}
          </button>
        }
      />

      <div className="discover-filters">
        <div className="filter-group">
          <span className="filter-label">{t("discover.category")}</span>
          <div className="filter-pills">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`pill ${category === c.id ? "pill-active" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">{t("discover.period")}</span>
          <div className="filter-pills">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pill ${timePeriod === p.id ? "pill-active" : ""}`}
                onClick={() => setTimePeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">{t("discover.sort")}</span>
          <div className="filter-pills">
            <button
              type="button"
              className={`pill ${orderBy === "PNL" ? "pill-active" : ""}`}
              onClick={() => setOrderBy("PNL")}
            >
              {t("discover.sortPnl")}
            </button>
            <button
              type="button"
              className={`pill ${orderBy === "VOL" ? "pill-active" : ""}`}
              onClick={() => setOrderBy("VOL")}
            >
              {t("discover.sortVol")}
            </button>
          </div>
        </div>
      </div>

      {apiError && (
        <div className="alert alert-error">
          {apiError}
          {data?.hint && <p className="muted" style={{ margin: "0.5rem 0 0" }}>{data.hint}</p>}
        </div>
      )}

      <div className="panel panel-wide">
        {isLoading ? (
          <p className="muted" style={{ padding: "1rem" }}>
            {t("common.loading")}
          </p>
        ) : (
          <table className="discover-table">
            <thead>
              <tr>
                <th>{t("table.rank")}</th>
                <th>{t("table.trader")}</th>
                <th>{t("table.pnl")}</th>
                <th>{t("table.volume")}</th>
                <th>{t("table.address")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {traders.map((tr) => (
                <tr key={tr.proxyWallet}>
                  <td className="rank-cell">{tr.rank}</td>
                  <td>
                    <div className="trader-cell">
                      {tr.profileImage ? (
                        <img src={tr.profileImage} alt="" className="trader-avatar" />
                      ) : (
                        <div className="trader-avatar trader-avatar-fallback">
                          {(tr.userName ?? tr.proxyWallet).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <Link
                          to={`/discover/trader/${encodeURIComponent(tr.proxyWallet)}`}
                          className="trader-name"
                        >
                          {tr.userName ? `@${tr.userName.replace(/^@/, "")}` : tr.suggestedId}
                        </Link>
                        <a
                          href={tr.polymarketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="link-sm"
                          title="Polymarket"
                        >
                          ↗
                        </a>
                        {tr.xUsername && <div className="muted trader-x">@{tr.xUsername.replace(/^@/, "")}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={tr.pnl >= 0 ? "pnl-pos" : "pnl-neg"}>{formatUsd(tr.pnl)}</td>
                  <td>{formatUsd(tr.vol)}</td>
                  <td className="mono">{`${tr.proxyWallet.slice(0, 8)}…${tr.proxyWallet.slice(-4)}`}</td>
                  <td className="actions-cell">
                    {tr.following && tr.followingLeaderId ? (
                      <UnfollowLeaderButton leaderId={tr.followingLeaderId} compact />
                    ) : (
                      <button type="button" className="btn-sm" onClick={() => setModalTrader(tr)}>
                        {t("discover.follow")}
                      </button>
                    )}
                    <Link
                      className="link-sm"
                      to={`/leaders/new?address=${encodeURIComponent(tr.proxyWallet)}&id=${encodeURIComponent(tr.suggestedId)}`}
                    >
                      {t("discover.advanced")}
                    </Link>
                  </td>
                </tr>
              ))}
              {!traders.length && !isLoading && (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: "1.5rem" }}>
                    {t("discover.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalTrader && (
        <AddTraderModal
          trader={modalTrader}
          onClose={() => setModalTrader(null)}
          onSuccess={() => setModalTrader(null)}
        />
      )}
    </>
  );
}
