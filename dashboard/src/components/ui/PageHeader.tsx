import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, badges, meta, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <div className="page-header-titles">
          <div className="page-header-row">
            <h1 className="page-title">{title}</h1>
            {badges && <div className="page-header-badges">{badges}</div>}
          </div>
          {subtitle && <p className="page-desc">{subtitle}</p>}
          {meta && <div className="page-header-meta">{meta}</div>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
