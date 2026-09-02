import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatRwf } from "@billa/shared";
import { apiRequest } from "../lib/apiClient";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Spinner } from "../components/Spinner";
import { useTheme } from "../context/ThemeContext";
import { usePageTitle } from "../context/PageTitleContext";

interface MonthlyRevenueRow {
  month: string;
  invoiced: number;
  credited: number;
  net: number;
}

function describeRevenueChange(thisMonth: number, lastMonth: number): { text: string; tone: "up" | "down" | "flat" } {
  if (lastMonth === 0) {
    return thisMonth === 0
      ? { text: "No invoices last month either", tone: "flat" }
      : { text: "Nothing invoiced last month to compare", tone: "flat" };
  }
  const diff = thisMonth - lastMonth;
  if (diff === 0) return { text: "Same as last month", tone: "flat" };
  const pct = Math.round((diff / lastMonth) * 100);
  return diff > 0 ? { text: `+${pct}% vs last month`, tone: "up" } : { text: `${pct}% vs last month`, tone: "down" };
}

interface TopItemRow {
  description: string;
  total: number;
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
  totalCollected: number;
  totalOutstanding: number;
  daysSalesOutstanding: number | null;
  monthlyRevenue: MonthlyRevenueRow[];
  topCustomers: TopCustomerRow[];
  topItems: TopItemRow[];
}

interface TaxRateRow {
  rate: number;
  taxableAmount: number;
  taxAmount: number;
}

interface TaxSummary {
  totalTaxInvoiced: number;
  totalTaxCredited: number;
  totalTaxCollected: number;
  byRate: TaxRateRow[];
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short" });
}

export default function Revenue() {
  usePageTitle("Revenue");
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
  const [reloadToken, setReloadToken] = useState(0);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [taxLoadError, setTaxLoadError] = useState(false);
  const [taxReloadToken, setTaxReloadToken] = useState(0);
  const [taxFrom, setTaxFrom] = useState(startOfMonthIso());
  const [taxTo, setTaxTo] = useState(todayIso());

  useEffect(() => {
    setLoadError(false);
    apiRequest<RevenueSummary>("/dashboard/revenue")
      .then(setSummary)
      .catch(() => setLoadError(true));
  }, [reloadToken]);

  useEffect(() => {
    setTaxLoadError(false);
    apiRequest<TaxSummary>(`/reports/tax-summary?from=${taxFrom}&to=${taxTo}`)
      .then(setTaxSummary)
      .catch(() => setTaxLoadError(true));
  }, [taxFrom, taxTo, taxReloadToken]);

  const hasRevenue = summary !== null && summary.invoicedYearToDate > 0;

  return (
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {loadError && <LoadErrorBanner message="Couldn't load revenue." onRetry={() => setReloadToken((t) => t + 1)} />}

        {!summary && !loadError && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

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
                {(() => {
                  const change = describeRevenueChange(summary.invoicedThisMonth, summary.invoicedLastMonth);
                  return (
                    <p
                      className={`mt-1 font-sans text-xs font-medium ${
                        change.tone === "up" ? "text-success" : change.tone === "down" ? "text-error" : "text-neutral-400"
                      }`}
                    >
                      {change.text}
                    </p>
                  );
                })()}
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

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Collected, last 12 months</p>
                <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                  {formatRwf(summary.totalCollected)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Outstanding right now</p>
                <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                  {formatRwf(summary.totalOutstanding)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-surface p-5">
                <p className="font-sans text-sm text-neutral-500">Days sales outstanding</p>
                <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                  {summary.daysSalesOutstanding !== null ? `${summary.daysSalesOutstanding} days` : "Not enough data"}
                </p>
                <p className="mt-1 font-sans text-xs text-neutral-400">
                  Simplified estimate, not a full accrual-accounting figure.
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

              <div className="rounded-xl border border-neutral-200 bg-surface p-6">
                <p className="font-sans text-sm font-semibold text-neutral-900">Top items sold</p>
                <div className="mt-4 flex flex-col gap-1">
                  {summary.topItems.length === 0 ? (
                    <p className="font-sans text-sm text-neutral-500">No finalized invoices yet.</p>
                  ) : (
                    summary.topItems.map((item) => (
                      <div
                        key={item.description}
                        className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 font-sans text-sm"
                      >
                        <span className="text-neutral-900">{item.description}</span>
                        <span className="font-medium text-neutral-600">{formatRwf(item.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-semibold text-neutral-900">Tax summary</p>
              <p className="mt-1 font-sans text-xs text-neutral-500">
                Tax collected on finalized invoices, net of credit notes, for filing your own VAT return.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={taxFrom}
                onChange={(event) => setTaxFrom(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              <span className="font-sans text-sm text-neutral-400">to</span>
              <input
                type="date"
                aria-label="To date"
                value={taxTo}
                onChange={(event) => setTaxTo(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          {taxLoadError && (
            <div className="mt-4">
              <LoadErrorBanner message="Couldn't load the tax summary." onRetry={() => setTaxReloadToken((t) => t + 1)} />
            </div>
          )}

          {taxSummary && !taxLoadError && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="font-sans text-xs text-neutral-500">Tax invoiced</p>
                  <p className="mt-1 font-display text-lg font-semibold text-neutral-900">
                    {formatRwf(taxSummary.totalTaxInvoiced)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-xs text-neutral-500">Tax credited</p>
                  <p className="mt-1 font-display text-lg font-semibold text-neutral-900">
                    {formatRwf(taxSummary.totalTaxCredited)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-xs text-neutral-500">Tax collected</p>
                  <p className="mt-1 font-display text-lg font-semibold text-primary-700">
                    {formatRwf(taxSummary.totalTaxCollected)}
                  </p>
                </div>
              </div>

              {taxSummary.byRate.length > 0 && (
                <div className="overflow-x-auto">
                <table className="mt-4 w-full border-collapse font-sans text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="py-2">Rate</th>
                      <th className="py-2">Taxable amount</th>
                      <th className="py-2">Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxSummary.byRate.map((row) => (
                      <tr key={row.rate} className="border-b border-neutral-100">
                        <td className="py-2 text-neutral-900">{row.rate}%</td>
                        <td className="py-2 text-neutral-600">{formatRwf(row.taxableAmount)}</td>
                        <td className="py-2 text-neutral-600">{formatRwf(row.taxAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
  );
}
