import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPagination } from "../../components/admin/AdminPagination";
import { LoadErrorBanner } from "../../components/LoadErrorBanner";
import { Modal } from "../../components/Modal";
import { usePageTitle } from "../../context/PageTitleContext";
import { useToast } from "../../context/ToastContext";
import { apiRequest } from "../../lib/apiClient";
import { downloadFile } from "../../lib/downloadFile";
import { PlanBadge, PlanLegend, type PlanKey } from "../../lib/planColors";
import { usePaginatedList } from "../../lib/usePaginatedList";

interface AdminUserRow {
  id: string;
  name: string | null;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExtendTrialOpen, setIsExtendTrialOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("30");
  const [isExtendingTrial, setIsExtendingTrial] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setSelectedIds(new Set());
  }, [list.page]);

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === list.results.length ? new Set() : new Set(list.results.map((u) => u.id))));
  }

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

  async function confirmBulkExtendTrial() {
    const days = Number(extendDays);
    const ids = Array.from(selectedIds);
    setIsExtendingTrial(true);
    try {
      const outcomes = await Promise.allSettled(
        ids.map((id) => apiRequest(`/admin/users/${id}/extend-trial`, { method: "POST", body: { days } })),
      );
      const succeeded = outcomes.filter((o) => o.status === "fulfilled").length;
      const failed = outcomes.length - succeeded;
      if (failed === 0) {
        toast.success(`Extended the trial for ${succeeded} users by ${days} days`);
      } else {
        toast.error(`Extended ${succeeded} users, ${failed} failed`);
      }
      setSelectedIds(new Set());
      setIsExtendTrialOpen(false);
      list.reload();
    } finally {
      setIsExtendingTrial(false);
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
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setIsExtendTrialOpen(true)}
                  className="shrink-0 rounded-lg border border-primary-200 bg-primary-50 px-3.5 py-1.5 font-sans text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
                >
                  Extend trial ({selectedIds.size})
                </button>
              )}
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
            <div className="mt-4">
              <LoadErrorBanner message={list.error} onRetry={list.reload} />
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
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="w-8 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all users"
                      checked={selectedIds.size > 0 && selectedIds.size === list.results.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </th>
                  <th className="py-2">Name</th>
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
                      <input
                        type="checkbox"
                        aria-label={`Select ${user.email}`}
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleSelectRow(user.id)}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                    </td>
                    <td className="py-3 text-neutral-600">{user.name ?? "-"}</td>
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

        <Modal
          isOpen={isExtendTrialOpen}
          onClose={() => setIsExtendTrialOpen(false)}
          title={`Extend trial for ${selectedIds.size} users`}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bulkExtendDays" className="font-sans text-sm font-medium text-neutral-800">
                Days to extend by
              </label>
              <input
                id="bulkExtendDays"
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={(event) => setExtendDays(event.target.value)}
                className="rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsExtendTrialOpen(false)}
                className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExtendingTrial}
                onClick={confirmBulkExtendTrial}
                className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExtendingTrial ? "Extending…" : "Extend"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
  );
}
