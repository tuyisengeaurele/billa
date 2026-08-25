import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { useTheme } from "../../context/ThemeContext";
import { apiRequest } from "../../lib/apiClient";

interface DailyPoint {
  date: string;
  count: number;
}

interface PlanCount {
  plan: "NONE" | "MONTHLY" | "ANNUAL";
  count: number;
}

interface MetricsResponse {
  totalUsers: number;
  totalBusinesses: number;
  activeTrials: number;
  payingAccounts: number;
  signups7d: number;
  signups30d: number;
  documents7d: number;
  documents30d: number;
  dailySignups30d: DailyPoint[];
  dailyDocuments30d: DailyPoint[];
  planDistribution: PlanCount[];
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

const PLAN_LABELS: Record<PlanCount["plan"], string> = {
  NONE: "No plan / trial",
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
};

const PLAN_COLORS: Record<PlanCount["plan"], string> = {
  NONE: "#a1a1aa",
  MONTHLY: "#c2185b",
  ANNUAL: "#0d9488",
};

function DailyLineChart({
  data,
  color,
  gridColor,
  tickColor,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
}: {
  data: DailyPoint[];
  color: string;
  gridColor: string;
  tickColor: string;
  tooltipStyle: object;
  tooltipLabelStyle: object;
  tooltipItemStyle: object;
}) {
  if (data.length === 0) {
    return <p className="font-sans text-sm text-neutral-500">No data in the last 30 days.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="date"
          tickFormatter={(date: string) => date.slice(5)}
          tick={{ fontSize: 11, fill: tickColor }}
          axisLine={false}
          tickLine={false}
          interval={2}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          formatter={(value) => [value, "Count"]}
          labelFormatter={(label) => String(label)}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Line type="monotone" dataKey="count" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function AdminMetrics() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gridColor = isDark ? "#3f3f46" : "#e4e4e7";
  const tickColor = isDark ? "#8b8b93" : "#71717a";
  const tooltipStyle = {
    borderRadius: 8,
    borderColor: gridColor,
    fontSize: 12,
    backgroundColor: isDark ? "#1c1c1f" : "#ffffff",
    color: isDark ? "#fafafa" : "#18181b",
  };
  const tooltipLabelStyle = { color: isDark ? "#fafafa" : "#18181b" };
  const tooltipItemStyle = { color: isDark ? "#fafafa" : "#18181b" };

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
                <div
                  key={tile.key}
                  className="rounded-xl border border-neutral-200 bg-surface p-4 transition-shadow hover:shadow-sm"
                >
                  <p className="font-sans text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {tile.label}
                  </p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-neutral-900">
                    {metrics[tile.key] as number}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-surface p-6">
                <h2 className="font-display text-base font-semibold text-neutral-900">Signups, last 30 days</h2>
                <div className="mt-4">
                  <DailyLineChart
                    data={metrics.dailySignups30d}
                    color="#c2185b"
                    gridColor={gridColor}
                    tickColor={tickColor}
                    tooltipStyle={tooltipStyle}
                    tooltipLabelStyle={tooltipLabelStyle}
                    tooltipItemStyle={tooltipItemStyle}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-surface p-6">
                <h2 className="font-display text-base font-semibold text-neutral-900">Documents, last 30 days</h2>
                <div className="mt-4">
                  <DailyLineChart
                    data={metrics.dailyDocuments30d}
                    color="#2563eb"
                    gridColor={gridColor}
                    tickColor={tickColor}
                    tooltipStyle={tooltipStyle}
                    tooltipLabelStyle={tooltipLabelStyle}
                    tooltipItemStyle={tooltipItemStyle}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-surface p-6 lg:col-span-2">
                <h2 className="font-display text-base font-semibold text-neutral-900">Plan distribution</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={metrics.planDistribution}
                      dataKey="count"
                      nameKey="plan"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {metrics.planDistribution.map((entry) => (
                        <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, item) => [value, PLAN_LABELS[item.payload.plan as PlanCount["plan"]]]}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Legend formatter={(value) => PLAN_LABELS[value as PlanCount["plan"]]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
