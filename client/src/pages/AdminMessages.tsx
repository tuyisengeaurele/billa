import { useEffect, useState } from "react";
import { AdminPagination } from "../components/admin/AdminPagination";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Modal } from "../components/Modal";
import { usePageTitle } from "../context/PageTitleContext";
import { useToast } from "../context/ToastContext";
import { apiRequest, ApiError } from "../lib/apiClient";

interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  repliedAt: string | null;
  replyMessage: string | null;
}

interface ContactMessageList {
  results: ContactMessageRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

export default function AdminMessages() {
  usePageTitle("Contact messages");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ContactMessageList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
  const toast = useToast();

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
  }, [page, reloadToken]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await apiRequest(`/contact/${pendingDeleteId}`, { method: "DELETE" });
      setData((prev) =>
        prev ? { ...prev, results: prev.results.filter((row) => row.id !== pendingDeleteId), total: prev.total - 1 } : prev,
      );
      toast.success("Message deleted");
      setPendingDeleteId(null);
    } catch {
      toast.error("Couldn't delete this message. Try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleReply(id: string) {
    setOpenReplyId((prev) => (prev === id ? null : id));
  }

  async function sendReply(id: string) {
    const draft = (replyDrafts[id] ?? "").trim();
    if (!draft) return;
    setSendingReplyId(id);
    try {
      const response = await apiRequest<{ message: ContactMessageRow }>(`/contact/${id}/reply`, {
        method: "POST",
        body: { message: draft },
      });
      setData((prev) =>
        prev ? { ...prev, results: prev.results.map((row) => (row.id === id ? response.message : row)) } : prev,
      );
      setReplyDrafts((prev) => ({ ...prev, [id]: "" }));
      setOpenReplyId(null);
      toast.success("Reply sent");
    } catch {
      toast.error("Couldn't send this reply. Try again.");
    } finally {
      setSendingReplyId(null);
    }
  }

  return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          {isForbidden && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              You don't have access to this page.
            </div>
          )}

          {loadError && (
            <LoadErrorBanner message="Couldn't load messages." onRetry={() => setReloadToken((t) => t + 1)} />
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
                  <div
                    key={row.id}
                    className="rounded-lg border border-neutral-200 p-4 transition-colors hover:bg-neutral-50"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-sans text-sm font-semibold text-neutral-900">
                        {row.name} <span className="font-normal text-neutral-500">({row.email})</span>
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-sans text-xs text-neutral-400">{row.createdAt.slice(0, 10)}</span>
                        <button
                          type="button"
                          onClick={() => toggleReply(row.id)}
                          className="font-sans text-xs font-medium text-primary-600 hover:underline"
                        >
                          Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(row.id)}
                          className="font-sans text-xs font-medium text-error hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 font-sans text-sm text-neutral-600">{row.message}</p>

                    {row.repliedAt && (
                      <div className="mt-3 rounded-lg bg-primary-50 p-3">
                        <p className="font-sans text-xs font-medium text-primary-700">
                          Replied on {row.repliedAt.slice(0, 10)}
                        </p>
                        <p className="mt-1 font-sans text-sm text-neutral-700">{row.replyMessage}</p>
                      </div>
                    )}

                    {openReplyId === row.id && (
                      <div className="mt-3 flex flex-col gap-2">
                        <textarea
                          value={replyDrafts[row.id] ?? ""}
                          onChange={(event) =>
                            setReplyDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))
                          }
                          rows={3}
                          placeholder="Write your reply…"
                          aria-label={`Reply to ${row.name}`}
                          className="w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenReplyId(null)}
                            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!(replyDrafts[row.id] ?? "").trim() || sendingReplyId === row.id}
                            onClick={() => sendReply(row.id)}
                            className="rounded-lg bg-primary-500 px-3.5 py-1.5 font-sans text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {sendingReplyId === row.id ? "Sending…" : "Send reply"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <AdminPagination
                page={page}
                totalPages={totalPages}
                onPrevious={() => setPage(page - 1)}
                onNext={() => setPage(page + 1)}
              />
            </>
          )}
        </div>

        <Modal isOpen={pendingDeleteId !== null} onClose={() => setPendingDeleteId(null)} title="Delete message">
          <p className="font-sans text-sm text-neutral-600">This permanently deletes this message. This cannot be undone.</p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingDeleteId(null)}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={confirmDelete}
              className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Confirm delete"}
            </button>
          </div>
        </Modal>
      </div>
  );
}
