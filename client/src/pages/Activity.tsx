import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { usePaginatedList } from "../lib/usePaginatedList";
import { describeActivity } from "../lib/activityLabels";

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; email: string };
}

type SortBy = "createdAt";

export default function Activity() {
  const { user } = useAuth();
  const [showMineOnly, setShowMineOnly] = useState(false);
  const list = usePaginatedList<ActivityEntry, SortBy>({
    resourcePath: "/business/activity",
    defaultSortBy: "createdAt",
    extraParams: showMineOnly && user ? { actorUserId: user.id } : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Activity</h1>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowMineOnly(false)}
            className={`rounded-lg px-4 py-2 font-sans text-sm font-medium ${
              !showMineOnly ? "bg-primary-100 text-primary-700" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Team activity
          </button>
          <button
            type="button"
            onClick={() => setShowMineOnly(true)}
            className={`rounded-lg px-4 py-2 font-sans text-sm font-medium ${
              showMineOnly ? "bg-primary-100 text-primary-700" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            My activity
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          {list.error && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {list.error}
            </div>
          )}

          {list.isLoading ? (
            <div className="flex flex-col gap-2" aria-label="Loading activity">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <p className="font-sans text-sm text-neutral-600">
              {showMineOnly ? "You haven't done anything yet." : "No activity yet."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {list.results.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-3 font-sans text-sm">
                  <span className="text-neutral-900">
                    <span className="font-medium">{entry.actor.email}</span>{" "}
                    {describeActivity(entry.action, entry.metadata)}
                  </span>
                  <span className="text-neutral-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
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
