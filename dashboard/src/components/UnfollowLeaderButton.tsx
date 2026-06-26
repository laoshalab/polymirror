import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unfollowLeader } from "../api/leaders";
import { translateApiMessage } from "../i18n/apiMessages";
import { ConfirmModal } from "./ui/ConfirmModal";
import { useToast } from "./ui/Toast";
import { useT } from "../i18n/I18nProvider";

interface UnfollowLeaderButtonProps {
  leaderId: string;
  compact?: boolean;
  className?: string;
  onSuccess?: () => void;
}

export function UnfollowLeaderButton({
  leaderId,
  compact,
  className,
  onSuccess,
}: UnfollowLeaderButtonProps) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unfollow = useMutation({
    mutationFn: () => unfollowLeader(leaderId),
    onSuccess: (r) => {
      toast(
        r.message ? translateApiMessage(t, r.message) : t("leaders.unfollowDone", { id: leaderId }),
        "success"
      );
      void queryClient.invalidateQueries({ queryKey: ["leaders"] });
      void queryClient.invalidateQueries({ queryKey: ["discover"] });
      void queryClient.invalidateQueries({ queryKey: ["discover-trader"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      onSuccess?.();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const btnClass = className ?? (compact ? "secondary btn-sm btn-danger-text" : "secondary btn-danger-text");

  return (
    <>
      <button
        type="button"
        className={btnClass}
        disabled={unfollow.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {t("leaders.unfollow")}
      </button>
      <ConfirmModal
        open={confirmOpen}
        title={t("leaders.unfollowConfirmTitle", { id: leaderId })}
        variant="danger"
        confirmLabel={t("leaders.unfollowConfirmBtn")}
        loading={unfollow.isPending}
        description={t("leaders.unfollowConfirmDesc")}
        onConfirm={() => unfollow.mutate(undefined, { onSettled: () => setConfirmOpen(false) })}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
