import { useEffect, useState } from "react";
import { DOCUMENT_LANGUAGES, DOCUMENT_TYPES, type DocumentLanguage, type DocumentType, type InvoicePaymentStatus } from "@billa/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ExportCsvButton } from "../components/ExportCsvButton";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Modal } from "../components/Modal";
import { SelectAllCheckbox } from "../components/SelectAllCheckbox";
import { usePaginatedList } from "../lib/usePaginatedList";
import { ariaSortValue } from "../lib/ariaSort";
import { formatRwf } from "@billa/shared";
import { API_BASE_URL, apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { DOCUMENT_TYPE_COLORS } from "../lib/documentTypeColors";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS } from "../lib/paymentStatusColors";
import { usePageTitle } from "../context/PageTitleContext";
import { useToast } from "../context/ToastContext";

interface DocumentRow {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  total: number;
  customer: { name: string; email: string | null };
  paymentStatus: InvoicePaymentStatus | null;
}

const LANGUAGE_LABELS: Record<DocumentLanguage, string> = {
  EN: "English",
  FR: "French",
};

type SortBy = "issueDate" | "total" | "createdAt";

export default function Documents() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type") as DocumentType | null;
  const isUnified = typeParam === null;
  const labels = typeParam ? DOCUMENT_TYPE_LABELS[typeParam] : null;
  const [selectedTypes, setSelectedTypes] = useState<DocumentType[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkSendLanguageOpen, setIsBulkSendLanguageOpen] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const extraParams: Record<string, string> = {};
  if (typeParam) {
    extraParams.type = typeParam;
  } else if (selectedTypes.length > 0) {
    extraParams.type = selectedTypes.join(",");
  }
  if (dateFrom) extraParams.dateFrom = dateFrom;
  if (dateTo) extraParams.dateTo = dateTo;

  const list = usePaginatedList<DocumentRow, SortBy>({
    resourcePath: "/documents",
    defaultSortBy: "createdAt",
    extraParams,
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [list.page]);

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const heading = isUnified ? "All documents" : labels!.plural;
  usePageTitle(heading);
  const searchPlaceholder = isUnified ? "Search documents" : `Search ${labels!.plural.toLowerCase()}`;
  const emptyText = list.search.trim()
    ? `No ${isUnified ? "documents" : labels!.plural.toLowerCase()} match "${list.search.trim()}".`
    : isUnified
      ? "No documents yet."
      : `No ${labels!.plural.toLowerCase()} yet.`;
  const loadingLabel = isUnified ? "Loading documents" : `Loading ${labels!.plural.toLowerCase()}`;

  function openDocument(document: DocumentRow) {
    if (document.status === "DRAFT") {
      navigate(`/documents/${document.id}/edit`);
    } else {
      navigate(`/documents/${document.id}`);
    }
  }

  function toggleType(type: DocumentType) {
    setSelectedTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));
    list.setPage(1);
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.results.map((document) => document.id)));
    }
  }

  const selectedDocuments = list.results.filter((document) => selectedIds.has(document.id));
  const selectedDrafts = selectedDocuments.filter((document) => document.status === "DRAFT");
  const selectedSendable = selectedDocuments.filter(
    (document) => document.status === "FINALIZED" && document.customer.email,
  );
  const allOnPageSelected = list.results.length > 0 && list.results.every((document) => selectedIds.has(document.id));

  async function confirmBulkDelete() {
    const targetIds = selectedDrafts.map((document) => document.id);
    setIsBulkProcessing(true);
    const outcomes = await Promise.allSettled(targetIds.map((id) => apiRequest(`/documents/${id}`, { method: "DELETE" })));
    setIsBulkProcessing(false);
    setIsBulkDeleteOpen(false);
    setSelectedIds(new Set());
    list.reload();

    const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    if (succeeded === targetIds.length) {
      toast.success(`${succeeded} draft${succeeded === 1 ? "" : "s"} deleted`);
    } else {
      toast.error(`Deleted ${succeeded} of ${targetIds.length} drafts. Some couldn't be deleted.`);
    }
  }

  async function confirmBulkSend(language: DocumentLanguage) {
    const targetIds = selectedSendable.map((document) => document.id);
    setIsBulkSendLanguageOpen(false);
    setIsBulkProcessing(true);
    const outcomes = await Promise.allSettled(
      targetIds.map((id) => apiRequest(`/documents/${id}/send`, { method: "POST", body: { language } })),
    );
    setIsBulkProcessing(false);
    setSelectedIds(new Set());
    list.reload();

    const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    if (succeeded === targetIds.length) {
      toast.success(`${succeeded} document${succeeded === 1 ? "" : "s"} sent`);
    } else {
      toast.error(`Sent ${succeeded} of ${targetIds.length}. Some couldn't be sent.`);
    }
  }

  return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {!isUnified && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/documents/new?type=${typeParam}`)}
              className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              New {labels!.singular}
            </button>
          </div>
        )}

        {isUnified && (
          <div className="flex flex-wrap gap-2">
            {DOCUMENT_TYPES.map((type) => {
              const colors = DOCUMENT_TYPE_COLORS[type];
              const isSelected = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-sm transition-colors ${
                    isSelected
                      ? "border-transparent " + colors.chipBgSelected
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {!isSelected && <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} aria-hidden="true" />}
                  {DOCUMENT_TYPE_LABELS[type].plural}
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={list.search}
              onChange={(event) => list.updateSearch(event.target.value)}
              className="w-full max-w-xs rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  list.setPage(1);
                }}
                className="rounded-lg border border-neutral-200 bg-surface px-3 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              <span className="font-sans text-sm text-neutral-400">to</span>
              <input
                type="date"
                aria-label="To date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  list.setPage(1);
                }}
                className="rounded-lg border border-neutral-200 bg-surface px-3 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="ml-auto">
              <ExportCsvButton path="/documents/export.csv" filename="documents.csv" />
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-neutral-50 px-4 py-3">
              <span className="font-sans text-sm font-medium text-neutral-700">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                {selectedDrafts.length > 0 && (
                  <button
                    type="button"
                    disabled={isBulkProcessing}
                    onClick={() => setIsBulkDeleteOpen(true)}
                    className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Delete drafts ({selectedDrafts.length})
                  </button>
                )}
                {selectedSendable.length > 0 && (
                  <button
                    type="button"
                    disabled={isBulkProcessing}
                    onClick={() => setIsBulkSendLanguageOpen(true)}
                    className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Send ({selectedSendable.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="font-sans text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700"
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}

          {list.error && (
            <div className="mt-4">
              <LoadErrorBanner message={list.error} onRetry={list.reload} />
            </div>
          )}

          {list.isLoading ? (
            <div className="mt-4 flex flex-col gap-2" aria-label={loadingLabel}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">{emptyText}</p>
              {!isUnified && (
                <button
                  type="button"
                  onClick={() => navigate(`/documents/new?type=${typeParam}`)}
                  className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  New {labels!.singular}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <SelectAllCheckbox
                      checked={allOnPageSelected}
                      indeterminate={selectedIds.size > 0 && !allOnPageSelected}
                      onChange={toggleSelectAll}
                      ariaLabel="Select all on this page"
                    />
                  </th>
                  <th className="py-2" aria-sort={ariaSortValue(list.sortBy, "issueDate", list.sortOrder)}>
                    <button type="button" onClick={() => list.toggleSort("issueDate")} className="cursor-pointer">
                      Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  {isUnified && <th className="py-2">Type</th>}
                  <th className="py-2">Number</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2" aria-sort={ariaSortValue(list.sortBy, "total", list.sortOrder)}>
                    <button type="button" onClick={() => list.toggleSort("total")} className="cursor-pointer">
                      Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {list.results.map((document) => (
                  <tr
                    key={document.id}
                    onClick={() => openDocument(document)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDocument(document);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${document.number ?? "draft"} document`}
                    className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                  >
                    <td className="py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(document.id)}
                        onChange={() => toggleSelectRow(document.id)}
                        aria-label={`Select ${document.number ?? document.customer.name}`}
                      />
                    </td>
                    <td className="py-3 text-neutral-600">{document.issueDate.slice(0, 10)}</td>
                    {isUnified && (
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENT_TYPE_COLORS[document.type].chipBg} ${DOCUMENT_TYPE_COLORS[document.type].chipText}`}
                        >
                          {DOCUMENT_TYPE_LABELS[document.type].singular}
                        </span>
                      </td>
                    )}
                    <td className="py-3 font-medium text-neutral-900">{document.number ?? "Draft"}</td>
                    <td className="py-3 text-neutral-600">{document.customer.name}</td>
                    <td className="py-3 text-neutral-600">{formatRwf(document.total)}</td>
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
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank");
                        }}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1 font-sans text-xs font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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

        <Modal isOpen={isBulkDeleteOpen} onClose={() => setIsBulkDeleteOpen(false)} title="Delete drafts">
          <p className="font-sans text-sm text-neutral-600">
            This permanently deletes {selectedDrafts.length} draft{selectedDrafts.length === 1 ? "" : "s"}. This
            cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsBulkDeleteOpen(false)}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isBulkProcessing}
              onClick={confirmBulkDelete}
              className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBulkProcessing ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>

        <Modal isOpen={isBulkSendLanguageOpen} onClose={() => setIsBulkSendLanguageOpen(false)} title="Send documents">
          <p className="font-sans text-sm text-neutral-600">Choose the language for these emails.</p>
          <div className="mt-4 flex flex-col gap-2">
            {DOCUMENT_LANGUAGES.map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => confirmBulkSend(language)}
                className="rounded-lg border border-neutral-200 px-4 py-2.5 text-left font-sans text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
              >
                {LANGUAGE_LABELS[language]}
              </button>
            ))}
          </div>
        </Modal>
      </div>
  );
}
