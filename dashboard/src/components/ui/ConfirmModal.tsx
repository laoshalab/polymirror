import type { ReactNode } from "react";
import { useT } from "../../i18n/I18nProvider";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useT();

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={`modal-panel confirm-modal confirm-modal-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className="modal-title">
          {title}
        </h2>
        <div className="confirm-modal-body">{description}</div>
        <div className="form-actions confirm-modal-actions">
          <button type="button" className="secondary" disabled={loading} onClick={onCancel}>
            {cancelLabel ?? t("confirm.defaultCancel")}
          </button>
          <button
            type="button"
            className={variant === "danger" ? "btn-danger" : "btn-primary"}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? t("common.processing") : (confirmLabel ?? t("confirm.defaultConfirm"))}
          </button>
        </div>
      </div>
    </div>
  );
}
