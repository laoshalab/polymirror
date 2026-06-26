import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { formatUsd } from "../api/discover";
import { AddTraderModal } from "../components/AddTraderModal";
import { UnfollowLeaderButton } from "../components/UnfollowLeaderButton";
import { DataCard } from "../components/ui/DataCard";
import { PageHeader } from "../components/ui/PageHeader";
import { useT } from "../i18n/I18nProvider";
import type { DiscoverTraderRow } from "../api/discover";
import { SideBadge } from "../utils/auditDisplay";

interface TraderDetailResponse {
  address: string;
  suggestedId: string;
  following: boolean;
  followingLeaderId?: string;
  polymarketUrl: string;
  tradeCount24h: number;
  error?: string;
  hint?: string;
  profile?: {
    userName?: string;
    profileImage?: string;
    xUsername?: string;
    bio?: string;
  };
  rankStats?: {
    rank: number;
    pnl: number;
    vol: number;
    userName?: string;
  };
  recentTrades: {
    timestamp: number;
    side?: string;
    size?: number;
    price?: number;
    usdcSize?: number;
    title?: string;
    outcome?: string;
  }[];
}

function fmtTime(ts: number) {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString();
}

export function DiscoverTraderPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { address: rawAddress } = useParams<{ address: string }>();
  const address = rawAddress ? decodeURIComponent(rawAddress) : "";
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["discover-trader", address],
    queryFn: () =>
      apiFetch<TraderDetailResponse>(`/api/discover/trader?address=${encodeURIComponent(address)}`),
    enabled: Boolean(address),
  });

  if (!address) return null;

  const displayName = data?.profile?.userName
    ? `@${data.profile.userName.replace(/^@/, "")}`
    : data?.suggestedId ?? address.slice(0, 10);

  const modalTrader: DiscoverTraderRow | null =
    data && !data.error
      ? {
          rank: data.rankStats?.rank ?? 0,
          proxyWallet: data.address,
          userName: data.profile?.userName ?? data.rankStats?.userName,
          pnl: data.rankStats?.pnl ?? 0,
          vol: data.rankStats?.vol ?? 0,
          profileImage: data.profile?.profileImage,
          xUsername: data.profile?.xUsername,
          suggestedId: data.suggestedId,
          following: data.following,
          followingLeaderId: data.followingLeaderId,
          polymarketUrl: data.polymarketUrl,
        }
      : null;

  return (
    <>
      <p className="breadcrumb">
        <Link to="/discover">{t("trader.backDiscover")}</Link>
      </p>

      {isLoading && (
        <>
          <PageHeader title={t("trader.detail")} subtitle={t("trader.loading")} />
          <div className="skeleton skeleton-title" style={{ maxWidth: 240 }} />
        </>
      )}

      {(error || data?.error) && (
        <>
          <PageHeader title={t("trader.detail")} />
          <div className="alert alert-error">
            {(error as Error)?.message ?? data?.error}
            {data?.hint && <p className="muted" style={{ margin: "0.5rem 0 0" }}>{data.hint}</p>}
          </div>
        </>
      )}

      {data && !data.error && (
        <>
          <div className="trader-header">
            {data.profile?.profileImage ? (
              <img src={data.profile.profileImage} alt="" className="trader-avatar-lg" />
            ) : (
              <div className="trader-avatar-lg trader-avatar-fallback">{displayName.slice(0, 1)}</div>
            )}
            <div className="trader-header-body">
              <PageHeader
                title={displayName}
                subtitle={<span className="mono">{data.address}</span>}
                badges={
                  data.following ? <span className="badge-following">{t("badge.following")}</span> : undefined
                }
                actions={
                  <>
                    {data.following && data.followingLeaderId ? (
                      <UnfollowLeaderButton
                        leaderId={data.followingLeaderId}
                        onSuccess={() => {
                          void queryClient.invalidateQueries({ queryKey: ["discover-trader", address] });
                        }}
                      />
                    ) : (
                      <button type="button" onClick={() => setShowModal(true)}>
                        {t("discover.follow")}
                      </button>
                    )}
                    <a href={data.polymarketUrl} target="_blank" rel="noreferrer" className="secondary btn-link-inline">
                      {t("account.polymarket")}
                    </a>
                  </>
                }
              />
              {data.profile?.bio && <p className="trader-bio">{data.profile.bio}</p>}
            </div>
          </div>

          <section className="page-section">
            <div className="cards">
              {data.rankStats && (
                <>
                  <DataCard label={t("trader.rankMonth")} value={`#${data.rankStats.rank}`} variant="accent" />
                  <DataCard
                    label={t("trader.pnlMonth")}
                    value={formatUsd(data.rankStats.pnl)}
                    variant={data.rankStats.pnl >= 0 ? "positive" : "negative"}
                  />
                  <DataCard label={t("trader.volMonth")} value={formatUsd(data.rankStats.vol)} />
                </>
              )}
              <DataCard label={t("trader.trades24h")} value={data.tradeCount24h} />
              <DataCard label={t("trader.recentTradeCount")} value={data.recentTrades.length} />
            </div>
          </section>

          <section className="page-section">
            <h2 className="section-title">{t("trader.recentTrades")}</h2>
          <div className="panel panel-wide">
            <table>
              <thead>
                <tr>
                  <th>{t("table.time")}</th>
                  <th>{t("table.side")}</th>
                  <th>{t("table.market")}</th>
                  <th>{t("table.priceCol")}</th>
                  <th>{t("table.shares")}</th>
                  <th>{t("table.usd")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrades.map((trade, i) => (
                  <tr key={`${trade.timestamp}-${i}`}>
                    <td>{fmtTime(trade.timestamp)}</td>
                    <td><SideBadge side={trade.side} /></td>
                    <td className="table-cell-detail">
                      {trade.title ?? trade.outcome ?? t("common.none")}
                    </td>
                    <td>{trade.price != null ? trade.price.toFixed(3) : t("common.none")}</td>
                    <td>{trade.size != null ? trade.size.toFixed(2) : t("common.none")}</td>
                    <td>{trade.usdcSize != null ? `$${trade.usdcSize.toFixed(2)}` : t("common.none")}</td>
                  </tr>
                ))}
                {!data.recentTrades.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      {t("trader.noTrades")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </section>
        </>
      )}

      {showModal && modalTrader && (
        <AddTraderModal trader={modalTrader} onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />
      )}
    </>
  );
}
