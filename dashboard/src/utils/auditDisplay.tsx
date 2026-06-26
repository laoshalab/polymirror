export function actionBadgeClass(action: string) {
  if (action === "COPY") return "action-badge action-copy";
  if (action === "SKIP") return "action-badge action-skip";
  if (action === "ERROR") return "action-badge action-error";
  if (action === "DETECT") return "action-badge action-detect";
  return "action-badge";
}

export function SideBadge({ side }: { side: string | null | undefined }) {
  if (!side) return <>—</>;
  return <span className={`side-badge side-${side.toLowerCase()}`}>{side}</span>;
}
