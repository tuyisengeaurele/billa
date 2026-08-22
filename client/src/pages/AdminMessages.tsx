import { useEffect, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { apiRequest, ApiError } from "../lib/apiClient";

interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

interface ContactMessageList {
  results: ContactMessageRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

export default function AdminMessages() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ContactMessageList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(false);
    setIsForbidden(false);
    apiRequest<ContactMessageList>(`/contact?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setIsForbidden(true);
        } else {
          setLoadError(true);
        }
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Contact messages</h1>

        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          {isForbidden && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              You don't have access to this page.
            </div>
          )}

          {loadError && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              Couldn't load messages. Try again.
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col gap-2" aria-label="Loading messages">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          )}

          {!isLoading && !isForbidden && !loadError && data && data.results.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">No messages yet.</p>
            </div>
          )}

          {!isLoading && !isForbidden && !loadError && data && data.results.length > 0 && (
            <>
              <div className="flex flex-col gap-4">
                {data.results.map((row) => (
                  <div key={row.id} className="rounded-lg border border-neutral-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-sans text-sm font-semibold text-neutral-900">
                        {row.name} <span className="font-normal text-neutral-500">({row.email})</span>
                      </p>
                      <span className="shrink-0 font-sans text-xs text-neutral-400">
                        {row.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    <p className="mt-2 font-sans text-sm text-neutral-600">{row.message}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between font-sans text-sm text-neutral-600">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
