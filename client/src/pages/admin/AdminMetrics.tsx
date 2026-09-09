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
import { useTheme } from "../../context/ThemeContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { apiRequest } from "../../lib/apiClient";
import { LoadErrorBanner } from "../../components/LoadErrorBanner";
import { PLAN_CHART_COLORS, PLAN_LABELS, type PlanKey } from "../../lib/planColors";

interface DailyPoint {
  date: string;
  count: number;
}

interface PlanCount {
  plan: PlanKey;
  count: number;
}

interface Activation {
  activatedBusinesses: number;
  totalBusinesses: number;
  rate: number;
}

interface RetentionWeek {
  weekIndex: number;
  retainedCount: number;
  rate: number;
}

interface RetentionCohort {
  cohortStart: string;
  cohortSize: number;
  weeks: RetentionWeek[];
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
  activation: Activation;
  retentionCohorts: RetentionCohort[];
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

  const total = data.reduce((sum, point) => sum + point.count, 0);

  return (
    <div role="img" aria-label={`Line chart, ${total} total across the last 30 days. A data table follows for details.`}>
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
      <table className="sr-only">
        <caption>Daily counts for the last 30 days</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function retentionCellStyle(rate: number): { backgroundColor: string; color: string } {
  const percent = Math.round(rate * 100);
  return {
    backgroundColor: `color-mix(in srgb, var(--color-primary-500) ${percent}%, transparent)`,
    color: rate >= 0.5 ? "#ffffff" : "var(--color-neutral-700, #3f3f46)",
  };
}

function RetentionCohortTable({ cohorts }: { cohorts: RetentionCohort[] }) {
  if (cohorts.length === 0) {
    return <p className="font-sans text-sm text-neutral-500">Not enough signups yet to show cohorts.</p>;
  }

  // Newest cohort first, since that's the one whose onboarding you're most likely
  // adjusting right now - and only as many week columns as any cohort actually has
  // data for yet, so a brand-new cohort's still-empty future weeks aren't drawn.
  const newestFirst = [...cohorts].reverse();
  const weekCount = Math.max(...cohorts.map((c) => c.weeks.length));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse font-sans text-sm">
        <caption className="sr-only">
          Weekly retention by signup cohort: the share of each week's new businesses that created a document in
          each week since.
        </caption>
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="py-2 pr-4 font-medium">Cohort (signup week)</th>
            <th className="py-2 pr-4 font-medium">Size</th>
            {Array.from({ length: weekCount }, (_, i) => (
              <th key={i} className="px-1 py-2 text-center font-medium">
                Week {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((cohort) => (
            <tr key={cohort.cohortStart} className="border-t border-neutral-100">
              <td className="py-2 pr-4 text-neutral-900">{cohort.cohortStart}</td>
              <td className="py-2 pr-4 tabular-nums text-neutral-600">{cohort.cohortSize}</td>
              {Array.from({ length: weekCount }, (_, weekIndex) => {
                const week = cohort.weeks[weekIndex];
                return (
                  <td key={weekIndex} className="p-1 text-center">
                    {week ? (
                      <span
                        className="block rounded-md px-2 py-1.5 tabular-nums"
                        style={retentionCellStyle(week.rate)}
                      >
                        {Math.round(week.rate * 100)}%
                      </span>
                    ) : (
                      <span className="block px-2 py-1.5 text-neutral-300" aria-hidden="true">
                        –
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminMetrics() {
  usePageTitle("Metrics");
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
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setError(null);
    apiRequest<MetricsResponse>("/admin/metrics")
      .then(setMetrics)
      .catch(() => setError("Couldn't load metrics."));
  }, [reloadToken]);

  return (
      <div className="flex flex-col gap-6">
        {error && <LoadErrorBanner message={error} onRetry={() => setReloadToken((t) => t + 1)} />}

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

            <div className="rounded-xl border border-neutral-200 bg-surface p-6">
              <h2 className="font-display text-base font-semibold text-neutral-900">Activation</h2>
              <p className="mt-1 font-sans text-sm text-neutral-500">
                Businesses that have finalized at least one document - the point they got real value, not just
                signed up.
              </p>
              <div className="mt-4 flex items-baseline gap-3">
                <p className="font-display text-3xl font-semibold tabular-nums text-neutral-900">
                  {Math.round(metrics.activation.rate * 100)}%
                </p>
                <p className="font-sans text-sm tabular-nums text-neutral-500">
                  {metrics.activation.activatedBusinesses} of {metrics.activation.totalBusinesses} businesses
                </p>
              </div>
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
                <div role="img" aria-label="Pie chart of accounts by plan. A data table follows for details.">
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
                          <Cell key={entry.plan} fill={PLAN_CHART_COLORS[entry.plan]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => [value, PLAN_LABELS[item.payload.plan as PlanKey]]}
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Legend formatter={(value) => PLAN_LABELS[value as PlanKey]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <table className="sr-only">
                    <caption>Accounts by plan</caption>
                    <thead>
                      <tr>
                        <th>Plan</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.planDistribution.map((entry) => (
                        <tr key={entry.plan}>
                          <td>{PLAN_LABELS[entry.plan]}</td>
                          <td>{entry.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-surface p-6">
              <h2 className="font-display text-base font-semibold text-neutral-900">Weekly retention</h2>
              <p className="mt-1 font-sans text-sm text-neutral-500">
                Of each week's new businesses, the share that created a document in each week since.
              </p>
              <div className="mt-4">
                <RetentionCohortTable cohorts={metrics.retentionCohorts} />
              </div>
            </div>
          </>
        )}
      </div>
  );
}
