import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type StatusResponse } from "../api/client";
import { useT } from "../i18n/I18nProvider";

function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function GlobalStatusBar() {
  const t = useT();
  const { data: s, isError } = useQuery({
    queryKey: ["status"],
    queryFn: () => apiFetch<StatusResponse>("/api/status"),
    refetchInterval: 5000,
  });

  const hasDrift = (s?.walletDrifts?.length ?? 0) > 0;
  const showBar =
    isError || s?.killSwitchActive || s?.lastError || hasDrift || (s && !s.previewMode);

  if (!showBar && !s) return null;

  if (isError) {
    return (
      <div className="status-bar status-bar-error" role="alert">
        <span className="status-bar-icon">⚠</span>
        <span>{t("statusBar.engineDown")}</span>
      </div>
    );
  }

  if (!s) return null;

  const items: { key: string; node: ReactNode; tone?: string }[] = [];

  if (s.killSwitchActive) {
    items.push({
      key: "kill",
      tone: "danger",
      node: (
        <>
          <span className="status-dot status-dot-kill" aria-hidden />
          {t("statusBar.killActive")}
          <Link to="/risk" className="status-bar-link">
            {t("statusBar.goRisk")}
          </Link>
        </>
      ),
    });
  }

  if (s.lastError) {
    items.push({
      key: "err",
      tone: "danger",
      node: <>{t("statusBar.lastError", { error: s.lastError })}</>,
    });
  }

  if (hasDrift) {
    items.push({
      key: "drift",
      tone: "warn",
      node: (
        <>
          {t("statusBar.drift", { count: s.walletDrifts.length })}
          <Link to="/positions" className="status-bar-link">
            {t("statusBar.viewPositions")}
          </Link>
        </>
      ),
    });
  }

  if (!s.previewMode && !s.killSwitchActive) {
    items.push({
      key: "live",
      tone: "live",
      node: (
        <>
          <span className="status-dot status-dot-live" aria-hidden />
          {t("statusBar.liveMode")}
        </>
      ),
    });
  }

  if (items.length === 0) return null;

  const tone = items.some((i) => i.tone === "danger")
    ? "error"
    : items.some((i) => i.tone === "warn")
      ? "warn"
      : items.some((i) => i.tone === "live")
        ? "live"
        : "info";

  const modeLabel = s.previewMode ? t("badge.previewShort") : t("badge.liveShort");

  return (
    <div className={`status-bar status-bar-${tone}`} role="status">
      <div className="status-bar-items">
        {items.map((item) => (
          <span key={item.key} className="status-bar-item">
            {item.node}
          </span>
        ))}
      </div>
      <span className="status-bar-meta muted">
        {t("statusBar.uptime", { mode: modeLabel, time: fmtUptime(s.uptimeSec) })}
      </span>
    </div>
  );
}
