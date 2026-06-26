import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AuditRow } from "../api/client";
import { FilterBar } from "../components/ui/FilterBar";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuditStream } from "../hooks/useAuditStream";
import { useT } from "../i18n/I18nProvider";
import { actionBadgeClass, SideBadge } from "../utils/auditDisplay";

const ACTIONS = ["", "DETECT", "SKIP", "COPY", "ERROR"] as const;

export function ActivityPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [leaderId, setLeaderId] = useState("");
  const [action, setAction] = useState("");
  const [liveRows, setLiveRows] = useState<AuditRow[]>([]);
  const [flashIds, setFlashIds] = useState<Set<number>>(() => new Set());

  const leaders = useQuery({
    queryKey: ["leaders"],
    queryFn: () => apiFetch<{ leaders: { id: string }[] }>("/api/leaders"),
  });

  const audit = useQuery({
    queryKey: ["audit", leaderId, action],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (leaderId) params.set("leaderId", leaderId);
      if (action) params.set("action", action);
      return apiFetch<{ items: AuditRow[]; total: number }>(`/api/audit?${params}`);
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    setLiveRows([]);
  }, [leaderId, action]);

  const onAudit = useCallback(
    (row: AuditRow) => {
      if (leaderId && row.leaderId !== leaderId) return;
      if (action && row.action !== action) return;

      setLiveRows((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        return [row, ...prev].slice(0, 100);
      });

      setFlashIds((prev) => new Set(prev).add(row.id));
      setTimeout(() => {
        setFlashIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }, 2200);

      void queryClient.invalidateQueries({ queryKey: ["audit", leaderId, action] });
      void queryClient.invalidateQueries({ queryKey: ["audit-recent"] });
      void queryClient.invalidateQueries({ queryKey: ["stats-hourly"] });
    },
    [leaderId, action, queryClient]
  );

  const { connected } = useAuditStream({ onAudit });

  const rows = useMemo(() => {
    const map = new Map<number, AuditRow>();
    for (const r of liveRows) map.set(r.id, r);
    for (const r of audit.data?.items ?? []) map.set(r.id, r);
    return [...map.values()].sort((a, b) => b.id - a.id).slice(0, 100);
  }, [liveRows, audit.data?.items]);

  return (
    <>
      <PageHeader
        title={t("activity.title")}
        subtitle={t("activity.subtitle")}
        badges={
          connected ? (
            <span className="badge badge-live">
              <span className="status-dot status-dot-live" style={{ marginRight: "0.35rem" }} />
              {t("badge.realtime")}
            </span>
          ) : (
            <span className="badge badge-preview">{t("badge.connecting")}</span>
          )
        }
        meta={
          audit.isFetching ? (
            <span className="muted">{t("common.sync")}</span>
          ) : (
            <span className="muted">
              {t("common.records", { count: audit.data?.total ?? rows.length })}
            </span>
          )
        }
      />

      <FilterBar meta={<span className="muted">{t("common.filter")}</span>}>
        <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} aria-label={t("table.leader")}>
          <option value="">{t("activity.allLeaders")}</option>
          {(leaders.data?.leaders ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.id}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label={t("table.action")}>
          {ACTIONS.map((a) => (
            <option key={a || "all"} value={a}>
              {a || t("activity.allActions")}
            </option>
          ))}
        </select>
      </FilterBar>

      <div className="panel panel-wide">
        <table>
          <thead>
            <tr>
              <th>{t("table.time")}</th>
              <th>{t("table.leader")}</th>
              <th>{t("table.action")}</th>
              <th>{t("table.side")}</th>
              <th>{t("table.token")}</th>
              <th>{t("table.size")}</th>
              <th>{t("table.price")}</th>
              <th>{t("table.reason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={flashIds.has(row.id) ? "row-flash" : undefined}>
                <td className="mono">{new Date(row.ts).toLocaleString()}</td>
                <td>{row.leaderId ?? t("common.none")}</td>
                <td>
                  <span className={actionBadgeClass(row.action)}>{row.action}</span>
                </td>
                <td>
                  <SideBadge side={row.side} />
                </td>
                <td className="mono">{row.tokenId?.slice(0, 10) ?? t("common.none")}</td>
                <td className="mono">{row.size ?? t("common.none")}</td>
                <td className="mono">{row.price ?? t("common.none")}</td>
                <td className="table-cell-detail" title={row.reason ?? undefined}>
                  {row.reason ?? t("common.none")}
                  {row.preview && <span className="badge badge-preview badge-xs">P</span>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="table-empty">
                  <span className="muted">{t("activity.noMatch")}</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
