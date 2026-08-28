import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatRwf, type DocumentType, type InvoicePaymentStatus } from "@billa/shared";
import { apiRequest } from "../lib/apiClient";
import { usePageTitle } from "../context/PageTitleContext";
import { usePaginatedList } from "../lib/usePaginatedList";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { DOCUMENT_TYPE_COLORS } from "../lib/documentTypeColors";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS } from "../lib/paymentStatusColors";
import { copyToClipboard } from "../lib/clipboard";

interface Customer {
  id: string;
  name: string;
  tin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  portalToken: string;
}

interface DocumentRow {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  total: number;
  amountPaid: number;
  paymentStatus: InvoicePaymentStatus | null;
}

type SortBy = "issueDate" | "total" | "createdAt";

export default function CustomerStatement() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  usePageTitle([{ label: "Customers", href: "/customers" }, { label: customer?.name ?? "Customer" }]);
  const [loadError, setLoadError] = useState(false);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);

  async function handleCopyPortalLink() {
    if (!customer) return;
    const url = `${window.location.origin}/portal/${customer.portalToken}`;
    const succeeded = await copyToClipboard(url);
    if (succeeded) {
      setPortalLinkCopied(true);
      setTimeout(() => setPortalLinkCopied(false), 3000);
    }
  }

  useEffect(() => {
    apiRequest<{ customer: Customer }>(`/customers/${id}`)
      .then((data) => setCustomer(data.customer))
      .catch(() => setLoadError(true));
  }, [id]);

  const list = usePaginatedList<DocumentRow, SortBy>({
    resourcePath: "/documents",
    defaultSortBy: "issueDate",
    pageSize: 50,
    extraParams: { customerId: id ?? "" },
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const documentsTotal = list.results.reduce((sum, doc) => sum + doc.total, 0);
  const outstandingTotal = list.results
    .filter((doc) => doc.type === "INVOICE" && doc.paymentStatus !== "PAID" && doc.paymentStatus !== "WRITTEN_OFF")
    .reduce((sum, doc) => sum + (doc.total - doc.amountPaid), 0);

  if (loadError) {
    return (
      <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
        Couldn't load this customer. Try again.
      </div>
    );
  }

  if (!customer) {
    return <p className="font-sans text-sm text-neutral-600">Loading…</p>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-sm text-neutral-500">
              {list.total} document{list.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopyPortalLink}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                {portalLinkCopied ? "Portal link copied" : "Copy portal link"}
              </button>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-sans text-sm text-neutral-500">
            {customer.phone && <span>{customer.phone}</span>}
            {customer.email && <span>{customer.email}</span>}
            {customer.tin && <span>TIN {customer.tin}</span>}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-4">
            <h2 className="font-display text-base font-semibold text-neutral-900">Documents</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-sans text-sm font-medium text-neutral-600">
              <span>Total on this page: {formatRwf(documentsTotal)}</span>
              {outstandingTotal > 0 && (
                <span className="text-amber-700">Outstanding on this page: {formatRwf(outstandingTotal)}</span>
              )}
            </div>
          </div>

          {list.error && (
            <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {list.error}
            </div>
          )}

          {list.isLoading ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading documents">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">No documents for this customer yet.</p>
            </div>
          ) : (
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <button type="button" onClick={() => list.toggleSort("issueDate")} className="cursor-pointer">
                      Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Number</th>
                  <th className="py-2">
                    <button type="button" onClick={() => list.toggleSort("total")} className="cursor-pointer">
                      Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2">Owed</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.results.map((document) => (
                  <tr key={document.id} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-600">{document.issueDate.slice(0, 10)}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENT_TYPE_COLORS[document.type].chipBg} ${DOCUMENT_TYPE_COLORS[document.type].chipText}`}
                      >
                        {DOCUMENT_TYPE_LABELS[document.type].singular}
                      </span>
                    </td>
                    <td className="py-3">
                      <Link
                        to={document.status === "DRAFT" ? `/documents/${document.id}/edit` : `/documents/${document.id}`}
                        className="font-medium text-primary-500 hover:text-primary-700"
                      >
                        {document.number ?? "Draft"}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-600">{formatRwf(document.total)}</td>
                    <td className="py-3 text-neutral-600">
                      {document.type === "INVOICE" ? formatRwf(document.total - document.amountPaid) : "N/A"}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            document.status === "FINALIZED"
                              ? "bg-primary-100 text-primary-700"
                              : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {document.status}
                        </span>
                        {document.paymentStatus && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${PAYMENT_STATUS_COLORS[document.paymentStatus]}`}
                          >
                            {PAYMENT_STATUS_LABELS[document.paymentStatus]}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!list.isLoading && list.results.length > 0 && (
            <div className="mt-4 flex items-center justify-between font-sans text-sm text-neutral-600">
              <span>
                Page {list.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={list.page <= 1}
                  onClick={() => list.setPage(list.page - 1)}
                  className="disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={list.page >= totalPages}
                  onClick={() => list.setPage(list.page + 1)}
                  className="disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
