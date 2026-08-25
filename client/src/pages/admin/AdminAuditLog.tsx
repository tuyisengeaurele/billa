import { AdminLayout } from "../../components/admin/AdminLayout";
import { usePaginatedList } from "../../lib/usePaginatedList";

interface AuditLogRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  admin: { id: string; email: string };
}

type SortBy = "createdAt";

export default function AdminAuditLog() {
  const list = usePaginatedList<AuditLogRow, SortBy>({ resourcePath: "/admin/audit-log", defaultSortBy: "createdAt" });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Audit log</h1>

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          {list.error && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {list.error}
            </div>
          )}

          {list.isLoading ? (
            <div className="flex flex-col gap-2" aria-label="Loading audit log">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <p className="font-sans text-sm text-neutral-600">No admin actions logged yet.</p>
          ) : (
            <table className="w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">Admin</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Target</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {list.results.map((entry) => (
                  <tr key={entry.id} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-900">{entry.admin.email}</td>
                    <td className="py-3 text-neutral-600">{entry.action}</td>
                    <td className="py-3 text-neutral-600">
                      {entry.targetType} · {entry.targetId}
                    </td>
                    <td className="py-3 text-neutral-600">{new Date(entry.createdAt).toLocaleString()}</td>
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
