import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminPagination } from "../../components/admin/AdminPagination";
import { usePageTitle } from "../../context/PageTitleContext";
import { useToast } from "../../context/ToastContext";
import { downloadFile } from "../../lib/downloadFile";
import { PlanBadge, PlanLegend, type PlanKey } from "../../lib/planColors";
import { usePaginatedList } from "../../lib/usePaginatedList";

interface AdminUserRow {
  id: string;
  email: string;
  isAdmin: boolean;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: string | null;
  createdAt: string;
}

type SortBy = "createdAt" | "email";

export default function AdminUsers() {
  usePageTitle("Users");
  const list = usePaginatedList<AdminUserRow, SortBy>({ resourcePath: "/admin/users", defaultSortBy: "createdAt" });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadFile("/admin/users/export.csv", "users.csv");
      toast.success("Exported users.csv");
    } catch {
      toast.error("Couldn't export users. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
      <div className="flex flex-col gap-6">

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Search by email"
              aria-label="Search users"
              value={list.search}
              onChange={(event) => list.updateSearch(event.target.value)}
              className="w-full max-w-xs rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <div className="flex items-center gap-3">
              <PlanLegend />
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExport}
                className="shrink-0 rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>

          {list.error && (
            <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {list.error}
            </div>
          )}

          {list.isLoading ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading users">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">No users found.</p>
            </div>
          ) : (
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">Email</th>
                  <th className="py-2">Admin</th>
                  <th className="py-2">Trial ends</th>
                  <th className="py-2">Plan</th>
                  <th className="py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {list.results.map((user) => (
                  <tr key={user.id} className="border-b border-neutral-100 transition-colors hover:bg-neutral-50">
                    <td className="py-3">
                      <Link
                        to={`/admin/users/${user.id}`}
                        className="font-medium text-primary-500 transition-colors hover:text-primary-700 hover:underline"
                      >
                        {user.email}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-600">{user.isAdmin ? "Yes" : "-"}</td>
                    <td className="py-3 text-neutral-600">{new Date(user.trialEndsAt).toLocaleDateString()}</td>
                    <td className="py-3">
                      <PlanBadge plan={(user.plan as PlanKey) ?? "NONE"} />
                    </td>
                    <td className="py-3 text-neutral-600">{new Date(user.createdAt).toLocaleDateString()}</td>
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
  );
}
