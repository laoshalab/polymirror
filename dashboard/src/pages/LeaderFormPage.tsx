import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LeaderForm } from "../components/LeaderForm";
import { PageHeader } from "../components/ui/PageHeader";
import { leaderToForm } from "../api/leaders";
import { apiFetch, getActiveAccountId, type LeaderRow } from "../api/client";
import { useT } from "../i18n/I18nProvider";

export function LeaderNewPage() {
  const t = useT();
  const [params] = useSearchParams();
  const address = params.get("address") ?? "";
  const id = params.get("id") ?? "";

  const initial = leaderToForm(
    address
      ? {
          id,
          address,
          enabled: true,
          weight: 1,
          strategy: { type: "PERCENTAGE", copySize: 5 },
          limits: { maxOrderUsd: 20 },
        }
      : undefined
  );

  return (
    <>
      <p className="breadcrumb">
        {address ? (
          <Link to="/discover">{t("leaders.backDiscover")}</Link>
        ) : (
          <Link to="/leaders">{t("leaders.backLeaders")}</Link>
        )}
      </p>
      <PageHeader
        title={t("leaders.addTitle")}
        subtitle={t("leaders.addSubtitle")}
      />
      <LeaderForm initial={initial} />
    </>
  );
}

export function LeaderEditPage({ leaderId }: { leaderId: string }) {
  const t = useT();
  return (
    <>
      <p className="breadcrumb">
        <Link to="/leaders">{t("leaders.backLeaders")}</Link>
      </p>
      <PageHeader title={t("leaders.editTitle")} subtitle={t("leaders.editSubtitle", { id: leaderId })} />
      <LeaderEditForm leaderId={leaderId} />
    </>
  );
}

function LeaderEditForm({ leaderId }: { leaderId: string }) {
  const t = useT();
  const accountId = getActiveAccountId() ?? "default";
  const { data, isLoading, error } = useQuery({
    queryKey: ["leader", accountId, leaderId],
    queryFn: () => apiFetch<{ leader: LeaderRow }>(`/api/leaders/${encodeURIComponent(leaderId)}`),
  });

  if (isLoading) return <p className="muted">{t("common.loading")}</p>;
  if (error) {
    return (
      <div className="alert alert-error">
        {(error as Error).message}
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          {t("leaders.editLoadHint")}
        </p>
      </div>
    );
  }
  if (!data?.leader) return <div className="alert alert-error">{t("common.loadFailed")}</div>;

  return <LeaderForm initial={leaderToForm(data.leader)} isEdit />;
}
