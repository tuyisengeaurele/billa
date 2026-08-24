import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DOCUMENT_TYPES, type DocumentStatus, type DocumentType } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { DOCUMENT_TYPE_COLORS } from "../lib/documentTypeColors";
import { useTheme } from "../context/ThemeContext";

interface RecentDocument {
  id: string;
  type: DocumentType;
  number: string | null;
  status: DocumentStatus;
  customerName: string;
  issueDate: string;
}

interface DocumentTypeCount {
  type: DocumentType;
  count: number;
}

interface ActivityDay {
  date: string;
  count: number;
}

interface DashboardSummary {
  draftCount: number;
  overdueInvoiceCount: number;
  recentDocuments: RecentDocument[];
  documentsThisMonth: number;
  documentsLastMonth: number;
  documentsByType: DocumentTypeCount[];
  activityByDay: ActivityDay[];
  customerCount: number;
  hasLogo: boolean;
}

const TYPE_MONOGRAM: Record<DocumentType, string> = {
  INVOICE: "IN",
  PROFORMA: "PR",
  DELIVERY_NOTE: "DN",
  QUOTE: "QU",
  RECEIPT: "RE",
};

function ChecklistStep({ to, label, done }: { to: string; label: string; done: boolean }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3 font-sans text-sm transition-colors hover:bg-surface-hover"
    >
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
            done ? "border-primary-500 bg-primary-500 text-white" : "border-neutral-300 text-transparent"
          }`}
        >
          ✓
        </span>
        <span className={done ? "text-neutral-500 line-through" : "text-neutral-900"}>{label}</span>
      </span>
      {done && <span className="font-sans text-xs font-medium text-primary-700">Done</span>}
    </Link>
  );
}

function monthComparison(thisMonth: number, lastMonth: number): string {
  const diff = thisMonth - lastMonth;
  if (diff === 0) return "Same as last month";
  if (diff > 0) return `${diff} more than last month`;
  return `${Math.abs(diff)} fewer than last month`;
}

export default function Dashboard() {
  const { business } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gridColor = isDark ? "#3f3f46" : "#e4e4e7";
  const tickColor = isDark ? "#8b8b93" : "#71717a";
  const tickColorStrong = isDark ? "#b4b4bb" : "#52525b";
  const tooltipStyle = {
    borderRadius: 8,
    borderColor: gridColor,
    fontSize: 12,
    backgroundColor: isDark ? "#1c1c1f" : "#ffffff",
    color: isDark ? "#fafafa" : "#18181b",
  };
  const tooltipLabelStyle = { color: isDark ? "#fafafa" : "#18181b" };
  const tooltipItemStyle = { color: isDark ? "#fafafa" : "#18181b" };
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<DashboardSummary>("/dashboard/summary")
      .then(setSummary)
      .catch(() => setLoadError(true));
  }, []);

  const hasNoDocuments = summary !== null && summary.recentDocuments.length === 0;
  const hasAttentionItems = summary !== null && (summary.draftCount > 0 || summary.overdueInvoiceCount > 0);

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Welcome, {business?.name ?? "there"}.
        </h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DOCUMENT_TYPES.map((type) => {
            const colors = DOCUMENT_TYPE_COLORS[type];
            return (
              <Link
                key={type}
                to={`/documents/new?type=${type}`}
                className="group flex flex-col gap-2 rounded-xl border border-neutral-200 bg-surface p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg font-sans text-xs font-semibold transition-colors ${colors.iconBg} ${colors.iconText}`}
                >
                  {TYPE_MONOGRAM[type]}
                </span>
                <p className="font-display text-sm font-semibold text-neutral-900">
                  New {DOCUMENT_TYPE_LABELS[type].singular}
                </p>
                <p className="line-clamp-2 font-sans text-xs text-neutral-500">
                  {DOCUMENT_TYPE_LABELS[type].description}
                </p>
              </Link>
            );
          })}
        </div>

        {loadError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            Couldn't load your dashboard. Try again.
          </div>
        )}

        {!summary && !loadError && <p className="font-sans text-sm text-neutral-600">Loading…</p>}

        {summary && hasNoDocuments && (
          <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-surface p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-900">Get started</h2>
              <p className="mt-1 font-sans text-sm text-neutral-600">
                A few quick steps before your first document.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <ChecklistStep to="/settings" label="Add your business logo" done={summary.hasLogo} />
              <ChecklistStep to="/customers" label="Add a customer" done={summary.customerCount > 0} />
            </div>
            <Link
              to="/documents/new?type=INVOICE"
              className="flex w-auto items-center justify-center self-start rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Create your first invoice
            </Link>
          </div>
        )}

        {summary && !hasNoDocuments && hasAttentionItems && (
          <div className="flex flex-wrap gap-3">
            {summary.draftCount > 0 && (
              <Link
                to="/documents"
                className="rounded-lg bg-warning-bg px-4 py-3 font-sans text-sm text-warning transition-transform hover:-translate-y-0.5"
              >
                {summary.draftCount} draft{summary.draftCount === 1 ? "" : "s"} waiting to be finalized
              </Link>
            )}
            {summary.overdueInvoiceCount > 0 && (
              <Link
                to="/documents"
                className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error transition-transform hover:-translate-y-0.5"
              >
                {summary.overdueInvoiceCount} invoice{summary.overdueInvoiceCount === 1 ? "" : "s"} past due date
              </Link>
            )}
          </div>
        )}

        {summary && !hasNoDocuments && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-surface p-6">
              <p className="font-sans text-sm text-neutral-500">Documents this month</p>
              <p className="mt-2 font-display text-4xl font-semibold text-neutral-900">
                {summary.documentsThisMonth}
              </p>
              <p className="mt-2 font-sans text-sm text-neutral-500">
                {monthComparison(summary.documentsThisMonth, summary.documentsLastMonth)}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-surface p-6 lg:col-span-2">
              <p className="font-sans text-sm font-semibold text-neutral-900">Documents by type</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={summary.documentsByType} layout="vertical" margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid horizontal={false} stroke={gridColor} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tickFormatter={(type: DocumentType) => DOCUMENT_TYPE_LABELS[type].plural}
                    tick={{ fontSize: 12, fill: tickColorStrong }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    formatter={(value) => [value, "Documents"]}
                    labelFormatter={(label) => DOCUMENT_TYPE_LABELS[label as DocumentType].plural}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {summary.documentsByType.map((entry) => (
                      <Cell key={entry.type} fill={DOCUMENT_TYPE_COLORS[entry.type].hex} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-surface p-6 lg:col-span-3">
              <p className="font-sans text-sm font-semibold text-neutral-900">Activity, last 14 days</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={summary.activityByDay} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
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
                    formatter={(value) => [value, "Documents"]}
                    labelFormatter={(label) => String(label)}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#c2185b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#c2185b" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {summary && !hasNoDocuments && (
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold text-neutral-900">Recent documents</h2>
            <div className="flex flex-col gap-1">
              {summary.recentDocuments.map((doc) => (
                <Link
                  key={doc.id}
                  to={doc.status === "DRAFT" ? `/documents/${doc.id}/edit` : `/documents/${doc.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-100 bg-surface px-4 py-3 font-sans text-sm transition-colors hover:bg-surface-hover"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENT_TYPE_COLORS[doc.type].chipBg} ${DOCUMENT_TYPE_COLORS[doc.type].chipText}`}
                  >
                    {DOCUMENT_TYPE_LABELS[doc.type].singular}
                  </span>
                  <span className="font-medium text-neutral-900">{doc.number ?? "Draft"}</span>
                  <span className="text-neutral-600">{doc.customerName}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      doc.status === "FINALIZED" ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {doc.status}
                  </span>
                  <span className="text-neutral-600">{doc.issueDate.slice(0, 10)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
