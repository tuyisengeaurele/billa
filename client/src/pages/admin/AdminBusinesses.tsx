import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
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

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Businesses</h1>

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
            <p className="mt-4 font-sans text-sm text-neutral-600">No businesses found.</p>
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
                  <tr key={business.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-3">
                      <Link
                        to={`/admin/businesses/${business.id}`}
                        className="font-medium text-primary-500 hover:underline"
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
    </AdminLayout>
  );
}
