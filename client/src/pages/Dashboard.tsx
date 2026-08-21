import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES, type DocumentStatus, type DocumentType } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface RecentDocument {
  id: string;
  type: DocumentType;
  number: string | null;
  status: DocumentStatus;
  customerName: string;
  issueDate: string;
}

interface DashboardSummary {
  draftCount: number;
  overdueInvoiceCount: number;
  recentDocuments: RecentDocument[];
}

export default function Dashboard() {
  const { business } = useAuth();
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
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Welcome, {business?.name ?? "there"}.
        </h1>

        <div className="flex flex-wrap gap-3">
          {DOCUMENT_TYPES.map((type) => (
            <Link
              key={type}
              to={`/documents/new?type=${type}`}
              className="rounded-lg border border-neutral-200 px-4 py-2.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
            >
              New {DOCUMENT_TYPE_LABELS[type].singular}
            </Link>
          ))}
        </div>

        {loadError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            Couldn't load your dashboard. Try again.
          </div>
        )}

        {!summary && !loadError && <p className="font-sans text-sm text-neutral-600">Loading…</p>}

        {summary && hasNoDocuments && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">You haven't created any documents yet.</p>
            <Link
              to="/documents/new?type=INVOICE"
              className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
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
                className="rounded-lg border border-neutral-200 px-4 py-3 font-sans text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {summary.draftCount} draft{summary.draftCount === 1 ? "" : "s"} waiting to be finalized
              </Link>
            )}
            {summary.overdueInvoiceCount > 0 && (
              <Link
                to="/documents"
                className="rounded-lg border border-neutral-200 px-4 py-3 font-sans text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {summary.overdueInvoiceCount} invoice{summary.overdueInvoiceCount === 1 ? "" : "s"} past due date
              </Link>
            )}
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
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 font-sans text-sm hover:bg-neutral-50"
                >
                  <span className="text-neutral-600">{DOCUMENT_TYPE_LABELS[doc.type].singular}</span>
                  <span>{doc.number ?? "Draft"}</span>
                  <span className="text-neutral-600">{doc.customerName}</span>
                  <span className="text-neutral-600">{doc.status}</span>
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
