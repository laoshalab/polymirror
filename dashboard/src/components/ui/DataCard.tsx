import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../i18n/I18nProvider";

interface DataCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  linkTo?: string;
  linkLabel?: string;
  variant?: "default" | "positive" | "negative" | "accent";
  className?: string;
}

export function DataCard({
  label,
  value,
  hint,
  linkTo,
  linkLabel,
  variant = "default",
  className = "",
}: DataCardProps) {
  const t = useT();
  const resolvedLinkLabel = linkLabel ?? t("common.view");

  return (
    <div className={`card data-card data-card-${variant} ${className}`.trim()}>
      <div className="card-label">
        <span>{label}</span>
        {linkTo && (
          <Link to={linkTo} className="card-link">
            {resolvedLinkLabel}
          </Link>
        )}
      </div>
      <div className="card-value">{value}</div>
      {hint && <div className="card-hint">{hint}</div>}
    </div>
  );
}
