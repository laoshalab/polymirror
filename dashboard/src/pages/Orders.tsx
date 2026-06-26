import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type PendingOrderRow } from "../api/client";
import { cancelPendingOrder } from "../api/orders";
import { PageHeader } from "../components/ui/PageHeader";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { useToast } from "../components/ui/Toast";
import { useT } from "../i18n/I18nProvider";
import { SideBadge } from "../utils/auditDisplay";
import { useState } from "react";

function fmtDuration(ms: number) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function OrdersPage() {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data, isError, error } = useQuery({
    queryKey: ["pending-orders"],
    queryFn: () => apiFetch<{ orders: PendingOrderRow[] }>("/api/orders/pending"),
    refetchInterval: 5000,
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => cancelPendingOrder(orderId),
    onSuccess: (r) => {
      toast(r.message ?? t("orders.cancelDone"), "success");
      void queryClient.invalidateQueries({ queryKey: ["pending-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const orders = data?.orders ?? [];
  const now = Date.now();

  return (
    <>
      <PageHeader
        title={t("orders.title")}
        subtitle={t("orders.subtitle")}
        meta={<span className="muted">{t("orders.count", { count: orders.length })}</span>}
      />

      {isError && <div className="alert alert-error">{(error as Error).message}</div>}

      <div className="panel panel-wide">
        <table>
          <thead>
            <tr>
              <th>{t("table.leader")}</th>
              <th>{t("table.side")}</th>
              <th>{t("table.token")}</th>
              <th>{t("table.priceCol")}</th>
              <th>{t("orders.filledTotal")}</th>
              <th>{t("orders.duration")}</th>
              <th>{t("table.orderId")}</th>
              <th>{t("table.action")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId}>
                <td>{o.leaderId}</td>
                <td>
                  <SideBadge side={o.side} />
                </td>
                <td className="mono">{o.tokenId.slice(0, 10)}…</td>
                <td className="mono">{o.price.toFixed(4)}</td>
                <td className="mono">
                  {o.filledShares.toFixed(2)} / {o.size.toFixed(2)}
                </td>
                <td>{fmtDuration(now - o.createdAt)}</td>
                <td className="mono">{o.orderId.slice(0, 12)}…</td>
                <td>
                  <button
                    type="button"
                    className="secondary link-sm btn-danger-text"
                    disabled={cancel.isPending}
                    onClick={() => setCancelId(o.orderId)}
                  >
                    {t("orders.cancel")}
                  </button>
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={8} className="table-empty">
                  <span className="muted">{t("orders.empty")}</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={cancelId !== null}
        title={t("orders.cancelConfirmTitle")}
        variant="danger"
        confirmLabel={t("orders.cancelConfirmBtn")}
        loading={cancel.isPending}
        description={t("orders.cancelConfirmDesc")}
        onConfirm={() => {
          if (cancelId) {
            cancel.mutate(cancelId, { onSettled: () => setCancelId(null) });
          }
        }}
        onCancel={() => setCancelId(null)}
      />
    </>
  );
}
