import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { useT } from "../i18n/I18nProvider";

export interface HourlyBucket {
  bucketMs: number;
  copyCount: number;
  skipCount: number;
  errorCount: number;
}

interface HourlyStatsResponse {
  accountId: string;
  hours: number;
  buckets: HourlyBucket[];
}

function fmtHour(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function OverviewHourlyChart() {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["stats-hourly"],
    queryFn: () => apiFetch<HourlyStatsResponse>("/api/stats/hourly?hours=24"),
    refetchInterval: 30000,
  });

  const buckets = data?.buckets ?? [];
  const maxVal = Math.max(1, ...buckets.map((b) => b.copyCount + b.skipCount + b.errorCount));
  const totalCopy = buckets.reduce((s, b) => s + b.copyCount, 0);

  if (isLoading && !buckets.length) {
    return (
      <div className="panel panel-inset hourly-chart">
        <div className="skeleton skeleton-title" style={{ maxWidth: 200, marginBottom: "1rem" }} />
        <div className="skeleton" style={{ height: 100 }} />
      </div>
    );
  }

  return (
    <div className="panel panel-inset hourly-chart">
      <div className="hourly-chart-header">
        <div>
          <div className="section-title" style={{ marginBottom: "0.25rem" }}>
            {t("hourlyChart.title")}
          </div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {t("hourlyChart.subtitle", { total: totalCopy })}
          </div>
        </div>
        <div className="hourly-chart-legend">
          <span className="legend-item legend-copy">COPY</span>
          <span className="legend-item legend-skip">SKIP</span>
          <span className="legend-item legend-error">ERROR</span>
        </div>
      </div>

      <div className="hourly-chart-bars" aria-label={t("hourlyChart.chartAria")}>
        {buckets.map((b) => {
          const total = b.copyCount + b.skipCount + b.errorCount;
          const h = total > 0 ? Math.max(4, (total / maxVal) * 100) : 2;
          const copyPct = total > 0 ? (b.copyCount / total) * 100 : 0;
          const skipPct = total > 0 ? (b.skipCount / total) * 100 : 0;
          const errPct = total > 0 ? (b.errorCount / total) * 100 : 0;
          return (
            <div key={b.bucketMs} className="hourly-bar-col" title={`${fmtHour(b.bucketMs)} · COPY ${b.copyCount}`}>
              <div className="hourly-bar-stack" style={{ height: `${h}%` }}>
                {b.errorCount > 0 && (
                  <span className="hourly-bar-seg hourly-bar-error" style={{ flex: errPct }} />
                )}
                {b.skipCount > 0 && (
                  <span className="hourly-bar-seg hourly-bar-skip" style={{ flex: skipPct }} />
                )}
                {b.copyCount > 0 && (
                  <span className="hourly-bar-seg hourly-bar-copy" style={{ flex: copyPct || 100 }} />
                )}
              </div>
              <span className="hourly-bar-label">{new Date(b.bucketMs).getHours()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
