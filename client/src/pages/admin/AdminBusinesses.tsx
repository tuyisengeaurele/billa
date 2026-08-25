import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminPagination } from "../../components/admin/AdminPagination";
import { downloadFile } from "../../lib/downloadFile";
import { usePaginatedList } from "../../lib/usePaginatedList";

interface AdminBusinessRow {
  id: string;
  name: string;
  ownerEmail: string;
  memberCount: number;
  documentCount: number;
  createdAt: string;
}

type SortBy = "createdAt" | "name";

export default function AdminBusinesses() {
  const list = usePaginatedList<AdminBusinessRow, SortBy>({
    resourcePath: "/admin/businesses",
    defaultSortBy: "createdAt",
  });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadFile("/admin/businesses/export.csv", "businesses.csv");
    } catch {
      setExportError("Couldn't export businesses. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">Businesses</h1>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExport}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        {exportError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {exportError}
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          <input
            type="text"
            placeholder="Search by name"
            aria-label="Search businesses"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />

          {list.error && (
            <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {list.error}
            </div>
          )}

          {list.isLoading ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading businesses">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">No businesses found.</p>
            </div>
          ) : (
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">Name</th>
                  <th className="py-2">Owner</th>
                  <th className="py-2">Members</th>
                  <th className="py-2">Documents</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {list.results.map((business) => (
                  <tr key={business.id} className="border-b border-neutral-100 transition-colors hover:bg-neutral-50">
                    <td className="py-3">
                      <Link
                        to={`/admin/businesses/${business.id}`}
                        className="font-medium text-primary-500 transition-colors hover:text-primary-700 hover:underline"
                      >
                        {business.name}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-600">{business.ownerEmail}</td>
                    <td className="py-3 text-neutral-600">{business.memberCount}</td>
                    <td className="py-3 text-neutral-600">{business.documentCount}</td>
                    <td className="py-3 text-neutral-600">{new Date(business.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!list.isLoading && list.results.length > 0 && (
            <AdminPagination
              page={list.page}
              totalPages={totalPages}
              onPrevious={() => list.setPage(list.page - 1)}
              onNext={() => list.setPage(list.page + 1)}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
