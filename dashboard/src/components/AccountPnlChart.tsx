import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAccountPnl,
  PNL_RANGE_IDS,
  type AccountPnlSnapshot,
  type PnlRange,
} from "../api/pnl";
import { formatUsd } from "../api/discover";
import { useT } from "../i18n/I18nProvider";

function buildChartPaths(points: { ts: number; pnl: number }[], width: number, height: number) {
  if (points.length < 2) return null;

  const pnls = points.map((p) => p.pnl);
  const min = Math.min(...pnls);
  const max = Math.max(...pnls);
  const pad = Math.max((max - min) * 0.08, 0.5);
  const yMin = min - pad;
  const yMax = max + pad;
  const ySpan = yMax - yMin || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.pnl - yMin) / ySpan) * height;
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return { line, area, positive: pnls[pnls.length - 1]! >= pnls[0]! };
}

function fmtPnl(n: number) {
  const sign = n >= 0 ? "" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

const RANGE_LABEL_KEYS: Record<PnlRange, string> = {
  "1d": "pnl.range1d",
  "1w": "pnl.range1w",
  "1m": "pnl.range1m",
  "1y": "pnl.range1y",
  ytd: "pnl.rangeYtd",
  all: "pnl.rangeAll",
};

export function AccountPnlChart() {
  const t = useT();
  const [range, setRange] = useState<PnlRange>("1d");

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["account-pnl", range],
    queryFn: () => fetchAccountPnl(range),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const chart = data?.points?.length ? buildChartPaths(data.points, 320, 120) : null;
  const pnlColor = (data?.currentPnl ?? 0) >= 0 ? "var(--green)" : "var(--red)";
  const gradientId = `pnl-grad-${range}`;

  return (
    <div className="account-pnl-chart panel">
      <div className="account-pnl-chart-header">
        <div>
          <div className="account-pnl-chart-label">
            <span className="account-pnl-dot" />
            {t("pnl.title")}
          </div>
          {isLoading ? (
            <div className="account-pnl-value muted">{t("pnl.loading")}</div>
          ) : (
            <>
              <div className="account-pnl-value" style={{ color: pnlColor }}>
                {fmtPnl(data?.currentPnl ?? 0)}
              </div>
              <div className="account-pnl-sub muted">
                {data?.rangeLabel ?? t("pnl.rangeFallback")}
              </div>
            </>
          )}
        </div>
        <div className="account-pnl-range-pills">
          {PNL_RANGE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`pnl-range-pill ${range === id ? "pnl-range-pill-active" : ""}`}
              onClick={() => setRange(id)}
            >
              {t(RANGE_LABEL_KEYS[id])}
            </button>
          ))}
        </div>
      </div>

      {data?.error && (
        <div className="alert alert-error" style={{ margin: "0.75rem 0 0" }}>
          {data.error}
          {data.hint && <p className="muted" style={{ margin: "0.35rem 0 0" }}>{data.hint}</p>}
        </div>
      )}

      {data?.source === "engine" && !data.error && (
        <p className="muted form-hint" style={{ margin: "0.5rem 0 0" }}>
          {t("pnl.engineFallback")}
        </p>
      )}

      <div className="account-pnl-chart-body">
        {isLoading && <div className="account-pnl-chart-empty muted">{t("pnl.loadingChart")}</div>}
        {!isLoading && isError && (
          <div className="account-pnl-chart-empty muted">{(error as Error).message}</div>
        )}
        {!isLoading && !isError && chart && (
          <svg
            viewBox="0 0 320 120"
            className="account-pnl-svg"
            preserveAspectRatio="none"
            role="img"
            aria-label={t("pnl.chartAria")}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.positive ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"} />
                <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
              </linearGradient>
            </defs>
            <path d={chart.area} fill={`url(#${gradientId})`} />
            <path
              d={chart.line}
              fill="none"
              stroke={chart.positive ? "var(--green)" : "var(--red)"}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {!isLoading && !isError && !chart && (
          <div className="account-pnl-chart-empty">
            <div className="account-pnl-placeholder-gradient" />
            <span className="muted">{t("pnl.noData")}</span>
          </div>
        )}
        {isFetching && !isLoading && (
          <span className="account-pnl-refresh muted">{t("pnl.refreshing")}</span>
        )}
      </div>

      {data && !isLoading && <PnlFooter data={data} />}
    </div>
  );
}

function PnlFooter({ data }: { data: AccountPnlSnapshot }) {
  const t = useT();
  return (
    <div className="account-pnl-footer">
      <span className="muted">
        {t("pnl.rangeChange")}{" "}
        <span className={data.change >= 0 ? "pnl-pos" : "pnl-neg"}>{formatUsd(data.change)}</span>
      </span>
      {data.previewMode && data.engineTodayPnl !== undefined && (
        <span className="muted">
          {t("pnl.engineToday")} {formatUsd(data.engineTodayPnl)}
        </span>
      )}
    </div>
  );
}
