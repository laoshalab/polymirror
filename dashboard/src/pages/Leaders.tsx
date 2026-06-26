import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type LeaderRow } from "../api/client";
import { apiPatch } from "../api/leaders";
import { LeaderInlineSettings } from "../components/LeaderInlineSettings";
import { UnfollowLeaderButton } from "../components/UnfollowLeaderButton";
import { PageHeader } from "../components/ui/PageHeader";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useToast } from "../components/ui/Toast";
import { useT } from "../i18n/I18nProvider";
import { polymarketProfileUrl } from "../utils/polymarket";

export function LeadersPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isError, error } = useQuery({
    queryKey: ["leaders"],
    queryFn: () => apiFetch<{ leaders: LeaderRow[] }>("/api/leaders"),
    refetchInterval: 10000,
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPatch(`/api/leaders/${encodeURIComponent(id)}`, { enabled }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leaders"] });
      toast(
        vars.enabled ? t("leaders.enabled", { id: vars.id }) : t("leaders.disabled", { id: vars.id }),
        "success"
      );
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <>
      <PageHeader
        title={t("leaders.title")}
        subtitle={t("leaders.subtitle")}
        actions={
          <Link to="/leaders/new" className="btn-link">
            {t("leaders.add")}
          </Link>
        }
      />

      {isError && (
        <div className="alert alert-error">{(error as Error).message}</div>
      )}

      <div className="panel panel-wide">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("table.address")}</th>
              <th>{t("common.enabled")}</th>
              <th>{t("leaders.ratioLabel")} / {t("leaders.capLabel")}</th>
              <th>strategy</th>
              <th>weight</th>
              <th>{t("table.volume")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.leaders ?? []).map((l) => {
              const profileUrl = polymarketProfileUrl({ username: l.username, address: l.address });
              return (
              <tr key={l.id}>
                <td>
                  {profileUrl ? (
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link-sm"
                      title={t("account.polymarket")}
                    >
                      {l.id}
                    </a>
                  ) : (
                    l.id
                  )}
                </td>
                <td className="mono">
                  {l.address
                    ? `${l.address.slice(0, 8)}…${l.address.slice(-6)}`
                    : l.username
                      ? `@${l.username}`
                      : t("common.none")}
                </td>
                <td>
                  <ToggleSwitch
                    checked={l.enabled}
                    disabled={toggle.isPending}
                    label={`${l.enabled ? t("common.disabled") : t("common.enabled")} Leader ${l.id}`}
                    onChange={(enabled) => toggle.mutate({ id: l.id, enabled })}
                  />
                </td>
                <td>
                  <LeaderInlineSettings leader={l} />
                </td>
                <td className="muted">{l.strategy.type}</td>
                <td>{l.weight}</td>
                <td className="mono">${l.todayVolumeUsd.toFixed(2)}</td>
                <td>
                  <Link to={`/leaders/${encodeURIComponent(l.id)}/edit`}>{t("common.edit")}</Link>
                  {" · "}
                  <UnfollowLeaderButton leaderId={l.id} compact />
                </td>
              </tr>
            );
            })}
            {!data?.leaders.length && (
              <tr>
                <td colSpan={8} className="table-empty">
                  <span className="muted">
                    {t("leaders.empty")}{" "}
                    <Link to="/leaders/new">{t("leaders.addFirst")}</Link>
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
