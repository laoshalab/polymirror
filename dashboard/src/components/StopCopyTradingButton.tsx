import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { stopCopyTrading } from "../api/settings";
import { ConfirmModal } from "./ui/ConfirmModal";
import { useToast } from "./ui/Toast";
import { useT } from "../i18n/I18nProvider";

interface StopCopyTradingButtonProps {
  previewMode: boolean;
  copyTradingEnabled: boolean;
  compact?: boolean;
}

export function StopCopyTradingButton({
  previewMode,
  copyTradingEnabled,
  compact,
}: StopCopyTradingButtonProps) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stopped = previewMode && !copyTradingEnabled;
  if (stopped) return null;

  const stop = useMutation({
    mutationFn: stopCopyTrading,
    onSuccess: () => {
      toast(t("risk.stopCopyDone"), "success");
      queryClient.invalidateQueries({ queryKey: ["risk"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  function onConfirm() {
    stop.mutate(undefined, { onSettled: () => setConfirmOpen(false) });
  }

  return (
    <>
      <button
        type="button"
        className={compact ? "btn-danger btn-sm" : "btn-danger"}
        disabled={stop.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {t("risk.stopCopy")}
      </button>
      <ConfirmModal
        open={confirmOpen}
        title={t("risk.confirmStopTitle")}
        variant="danger"
        confirmLabel={t("risk.confirmStopBtn")}
        loading={stop.isPending}
        description={
          <>
            {t("risk.confirmStopDesc")}
            <br />
            <span className="muted">{t("risk.confirmStopHint")}</span>
          </>
        }
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
