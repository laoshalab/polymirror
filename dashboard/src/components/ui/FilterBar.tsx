import type { ReactNode } from "react";

interface FilterBarProps {
  children: ReactNode;
  meta?: ReactNode;
}

export function FilterBar({ children, meta }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-controls">{children}</div>
      {meta && <div className="filter-bar-meta">{meta}</div>}
    </div>
  );
}
