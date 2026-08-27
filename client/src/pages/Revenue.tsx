import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatRwf } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/apiClient";
import { useTheme } from "../context/ThemeContext";

interface MonthlyRevenueRow {
  month: string;
  invoiced: number;
  credited: number;
  net: number;
}

interface TopCustomerRow {
  customerId: string;
  name: string;
  total: number;
}

interface RevenueSummary {
  invoicedThisMonth: number;
  invoicedLastMonth: number;
  invoicedYearToDate: number;
  creditedYearToDate: number;
  netYearToDate: number;
  monthlyRevenue: MonthlyRevenueRow[];
  topCustomers: TopCustomerRow[];
}

function formatMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short" });
}

export default function Revenue() {
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
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<RevenueSummary>("/dashboard/revenue")
      .then(setSummary)
      .catch(() => setLoadError(true));
  }, []);

  const hasRevenue = summary !== null && summary.invoicedYearToDate > 0;

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">Revenue</h1>

        {loadError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            Couldn't load revenue. Try again.
          </div>
        )}

        {!summary && !loadError && <p className="font-sans text-sm text-neutral-600">Loading…</p>}

        {summary && !hasRevenue && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No revenue yet. Finalize an invoice to see it here.</p>
          </div>
        )}

        {summary && hasRevenue && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Invoiced this month</p>
                <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                  {formatRwf(summary.invoicedThisMonth)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Invoiced this year</p>
                <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                  {formatRwf(summary.invoicedYearToDate)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Credited this year</p>
                <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                  {formatRwf(summary.creditedYearToDate)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Net this year</p>
                <p className="mt-2 font-display text-2xl font-semibold text-primary-700">
                  {formatRwf(summary.netYearToDate)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-surface p-6">
              <p className="font-sans text-sm font-semibold text-neutral-900">Net revenue, last 6 months</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={summary.monthlyRevenue} margin={{ left: 0, right: 12, top: 16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 12, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value: number) => formatRwf(value)}
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value) => [formatRwf(Number(value)), "Net revenue"]}
                    labelFormatter={(label) => String(label)}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="net" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-surface p-6">
              <p className="font-sans text-sm font-semibold text-neutral-900">Top customers</p>
              <div className="mt-4 flex flex-col gap-1">
                {summary.topCustomers.length === 0 ? (
                  <p className="font-sans text-sm text-neutral-500">No finalized invoices yet.</p>
                ) : (
                  summary.topCustomers.map((customer) => (
                    <div
                      key={customer.customerId}
                      className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 font-sans text-sm"
                    >
                      <span className="text-neutral-900">{customer.name}</span>
                      <span className="font-medium text-neutral-600">{formatRwf(customer.total)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
