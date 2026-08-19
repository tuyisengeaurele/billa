import type { DocumentType } from "@billa/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { usePaginatedList } from "../lib/usePaginatedList";
import { formatRwf } from "@billa/shared";
import { API_BASE_URL } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface DocumentRow {
  id: string;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  total: number;
  customer: { name: string };
}

type SortBy = "issueDate" | "total" | "createdAt";

export default function Documents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = (searchParams.get("type") as DocumentType) ?? "INVOICE";
  const labels = DOCUMENT_TYPE_LABELS[type];

  const list = usePaginatedList<DocumentRow, SortBy>({
    resourcePath: "/documents",
    defaultSortBy: "createdAt",
    extraParams: { type },
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  function openDocument(document: DocumentRow) {
    if (document.status === "DRAFT") {
      navigate(`/documents/${document.id}/edit`);
    } else {
      navigate(`/documents/${document.id}`);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">{labels.plural}</h1>
          <button
            type="button"
            onClick={() => navigate(`/documents/new?type=${type}`)}
            className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            New {labels.singular}
          </button>
        </div>

        <input
          type="text"
          placeholder={`Search ${labels.plural.toLowerCase()}`}
          value={list.search}
          onChange={(event) => list.updateSearch(event.target.value)}
          className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />

        {list.error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {list.error}
          </div>
        )}

        {list.isLoading ? (
          <div className="flex flex-col gap-2" aria-label={`Loading ${labels.plural.toLowerCase()}`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : list.results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No {labels.plural.toLowerCase()} yet.</p>
            <button
              type="button"
              onClick={() => navigate(`/documents/new?type=${type}`)}
              className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              New {labels.singular}
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("issueDate")}>
                  Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Number</th>
                <th className="py-2">Customer</th>
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("total")}>
                  Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
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
                  className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="py-3">{document.issueDate.slice(0, 10)}</td>
                  <td className="py-3">{document.number ?? "Draft"}</td>
                  <td className="py-3 text-neutral-600">{document.customer.name}</td>
                  <td className="py-3 text-neutral-600">{formatRwf(document.total)}</td>
                  <td className="py-3 text-neutral-600">{document.status}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank");
                      }}
                      className="font-sans text-sm text-primary-500 hover:text-primary-700"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!list.isLoading && list.results.length > 0 && (
          <div className="flex items-center justify-between font-sans text-sm text-neutral-600">
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
    </AppLayout>
  );
}
