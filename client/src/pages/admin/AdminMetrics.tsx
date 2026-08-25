import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { apiRequest } from "../../lib/apiClient";

interface MetricsResponse {
  totalUsers: number;
  totalBusinesses: number;
  activeTrials: number;
  payingAccounts: number;
  signups7d: number;
  signups30d: number;
  documents7d: number;
  documents30d: number;
  dailySignups30d: { date: string; count: number }[];
}

const TILES: { key: keyof MetricsResponse; label: string }[] = [
  { key: "totalUsers", label: "Total users" },
  { key: "totalBusinesses", label: "Total businesses" },
  { key: "activeTrials", label: "Active trials" },
  { key: "payingAccounts", label: "Paying accounts" },
  { key: "signups7d", label: "Signups (7d)" },
  { key: "signups30d", label: "Signups (30d)" },
  { key: "documents7d", label: "Documents (7d)" },
  { key: "documents30d", label: "Documents (30d)" },
];

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="font-sans text-sm text-neutral-500">No signups in the last 30 days.</p>;
  }

  const width = 320;
  const height = 56;
  const max = Math.max(...data.map((d) => d.count), 1);
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width : (i / (data.length - 1)) * width;
    const y = height - (d.count / max) * height;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--color-primary-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminMetrics() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<MetricsResponse>("/admin/metrics")
      .then(setMetrics)
      .catch(() => setError("Couldn't load metrics. Try again."));
  }, []);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Metrics</h1>

        {error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {error}
          </div>
        )}

        {!metrics && !error && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Loading metrics">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-100" />
            ))}
          </div>
        )}

        {metrics && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {TILES.map((tile) => (
                <div key={tile.key} className="rounded-xl border border-neutral-200 bg-surface p-4">
                  <p className="font-sans text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {tile.label}
                  </p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-neutral-900">
                    {metrics[tile.key] as number}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-surface p-6">
              <h2 className="font-display text-base font-semibold text-neutral-900">Signups, last 30 days</h2>
              <div className="mt-4">
                <Sparkline data={metrics.dailySignups30d} />
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
