import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../api/leaders";
import { useT } from "../i18n/I18nProvider";
import type { DiscoverTraderRow } from "../api/discover";

interface Props {
  trader: DiscoverTraderRow;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddTraderModal({ trader, onClose, onSuccess }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const [id, setId] = useState(trader.suggestedId);
  const [copySize, setCopySize] = useState("5");
  const [maxOrderUsd, setMaxOrderUsd] = useState("20");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/leaders", {
        id: id.trim(),
        mode: "address",
        address: trader.proxyWallet,
        enabled: true,
        weight: 1,
        strategy: { type: "PERCENTAGE", copySize: parseFloat(copySize) },
        limits: { maxOrderUsd: parseFloat(maxOrderUsd) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaders"] });
      queryClient.invalidateQueries({ queryKey: ["discover"] });
      onSuccess();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const displayName = trader.userName ? `@${trader.userName.replace(/^@/, "")}` : trader.proxyWallet.slice(0, 10);
  const pnlStr =
    (trader.pnl >= 0 ? "+" : "") +
    `$${Math.abs(trader.pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t("modal.followTitle", { name: displayName })}</h2>
        <p className="muted modal-sub">
          {t("modal.rankPnl", { rank: trader.rank, pnl: pnlStr })}
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <label className="form-label">
          {t("leaders.leaderIdLabel")}
          <input type="text" value={id} onChange={(e) => setId(e.target.value)} pattern="[a-zA-Z0-9_-]+" />
        </label>
        <div className="form-row">
          <label className="form-label">
            {t("leaders.ratioLabel")}
            <input type="number" min="0.1" step="0.5" value={copySize} onChange={(e) => setCopySize(e.target.value)} />
          </label>
          <label className="form-label">
            {t("leaders.capLabel")}
            <input type="number" min="1" step="1" value={maxOrderUsd} onChange={(e) => setMaxOrderUsd(e.target.value)} />
          </label>
        </div>
        <p className="muted form-hint">{t("modal.saveHint")}</p>

        <div className="form-actions">
          <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("modal.adding") : t("modal.confirmFollow")}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
