import { AdminPagination } from "../../components/admin/AdminPagination";
import { usePageTitle } from "../../context/PageTitleContext";
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
  usePageTitle("Audit log");
  const list = usePaginatedList<AuditLogRow, SortBy>({ resourcePath: "/admin/audit-log", defaultSortBy: "createdAt" });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
      <div className="flex flex-col gap-6">
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
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">No admin actions logged yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  <tr key={entry.id} className="border-b border-neutral-100 transition-colors hover:bg-neutral-50">
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
            </div>
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
  );
}
