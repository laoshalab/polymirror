import { useQuery } from "@tanstack/react-query";
import { apiFetch, type PositionRow } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { useT } from "../i18n/I18nProvider";

export function PositionsPage() {
  const t = useT();
  const { data, isError, error } = useQuery({
    queryKey: ["positions"],
    queryFn: () => apiFetch<{ positions: PositionRow[] }>("/api/positions"),
    refetchInterval: 10000,
  });

  const positions = data?.positions ?? [];
  const byLeader = new Map<string, PositionRow[]>();
  for (const p of positions) {
    const list = byLeader.get(p.leaderId) ?? [];
    list.push(p);
    byLeader.set(p.leaderId, list);
  }

  return (
    <>
      <PageHeader
        title={t("positions.title")}
        subtitle={t("positions.subtitle")}
        meta={<span className="muted">{t("positions.count", { count: positions.length })}</span>}
      />

      {isError && <div className="alert alert-error">{(error as Error).message}</div>}

      {!positions.length && (
        <div className="panel panel-inset">
          <p className="muted">{t("positions.empty")}</p>
        </div>
      )}

      {[...byLeader.entries()].map(([leaderId, rows]) => (
        <section key={leaderId} className="page-section">
          <h2 className="section-title">{t("positions.leaderSection", { id: leaderId })}</h2>
          <div className="panel panel-wide">
            <table>
              <thead>
                <tr>
                  <th>{t("table.token")}</th>
                  <th>{t("table.shares")}</th>
                  <th>{t("table.avgPrice")}</th>
                  <th>{t("positions.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={`${p.leaderId}-${p.tokenId}`}>
                    <td className="mono">{p.tokenId.slice(0, 12)}…</td>
                    <td>{p.shares.toFixed(4)}</td>
                    <td className="mono">{p.avgEntryPrice.toFixed(4)}</td>
                    <td className="mono">${(p.shares * p.avgEntryPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
