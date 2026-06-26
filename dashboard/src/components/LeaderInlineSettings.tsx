import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "../api/leaders";
import type { LeaderRow } from "../api/client";
import { useT } from "../i18n/I18nProvider";
import { useToast } from "./ui/Toast";

interface Props {
  leader: LeaderRow;
}

export function LeaderInlineSettings({ leader }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pct = leader.strategy.type === "PERCENTAGE";
  const [copySize, setCopySize] = useState(String(leader.strategy.copySize));
  const [maxOrderUsd, setMaxOrderUsd] = useState(
    String(leader.limits?.maxOrderUsd ?? 20)
  );
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setCopySize(String(leader.strategy.copySize));
    setMaxOrderUsd(String(leader.limits?.maxOrderUsd ?? 20));
  }, [leader.strategy.copySize, leader.limits?.maxOrderUsd]);

  const save = useMutation({
    mutationFn: (body: { strategy?: { copySize: number }; limits?: { maxOrderUsd: number } }) =>
      apiPatch(`/api/leaders/${encodeURIComponent(leader.id)}`, body),
    onSuccess: () => {
      toast(t("leaders.savedParams"), "success");
      queryClient.invalidateQueries({ queryKey: ["leaders"] });
    },
    onError: (e: Error) => {
      setMsg(e.message);
      toast(e.message, "error");
    },
  });

  function commit() {
    const cs = parseFloat(copySize);
    const mo = parseFloat(maxOrderUsd);
    if (!Number.isFinite(cs) || cs <= 0) {
      setMsg(t("leaders.ratioRequired"));
      return;
    }
    if (!Number.isFinite(mo) || mo <= 0) {
      setMsg(t("leaders.capRequired"));
      return;
    }
    if (cs === leader.strategy.copySize && mo === (leader.limits?.maxOrderUsd ?? 20)) {
      return;
    }
    save.mutate({
      strategy: { copySize: cs },
      limits: { maxOrderUsd: mo },
    });
  }

  return (
    <div className="inline-settings">
      <label className="inline-field" title={pct ? t("leaders.ratioTooltip") : t("leaders.fixedTooltip")}>
        <span className="inline-label">{pct ? t("leaders.ratioLabel") : t("leaders.copyUsd")}</span>
        <input
          type="number"
          className="inline-input"
          step="0.5"
          min="0.1"
          value={copySize}
          disabled={save.isPending}
          onChange={(e) => setCopySize(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <label className="inline-field" title={t("leaders.capTooltip")}>
        <span className="inline-label">{t("leaders.capLabel")}</span>
        <input
          type="number"
          className="inline-input"
          step="1"
          min="1"
          value={maxOrderUsd}
          disabled={save.isPending}
          onChange={(e) => setMaxOrderUsd(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </label>
      {msg && (
        <span className={`inline-msg ${msg === t("leaders.savedParams") ? "ok" : "err"}`}>{msg}</span>
      )}
    </div>
  );
}
