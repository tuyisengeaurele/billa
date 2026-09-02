import { useEffect, useState } from "react";
import { AdminPagination } from "../components/admin/AdminPagination";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return chars.join("") || "?";
}

function ReplyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

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
  const awaitingReplyCount = data ? data.results.filter((row) => !row.repliedAt).length : 0;

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
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-neutral-900">Contact messages</h1>
            <p className="mt-1 font-sans text-sm text-neutral-500">
              {data && !isLoading
                ? `${data.total} message${data.total === 1 ? "" : "s"} total${awaitingReplyCount > 0 ? `, ${awaitingReplyCount} awaiting reply` : ""}`
                : "Messages sent through the contact form."}
            </p>
          </div>
        </div>

        {isForbidden && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            You don't have access to this page.
          </div>
        )}

        {loadError && <LoadErrorBanner message="Couldn't load messages." onRetry={() => setReloadToken((t) => t + 1)} />}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" label="Loading messages" />
          </div>
        )}

        {!isLoading && !isForbidden && !loadError && data && data.results.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-200 bg-surface py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <InboxIcon />
            </div>
            <p className="font-sans text-sm text-neutral-600">No messages yet.</p>
          </div>
        )}

        {!isLoading && !isForbidden && !loadError && data && data.results.length > 0 && (
          <>
            <div className="flex flex-col gap-4">
              {data.results.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-neutral-200 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display text-sm font-semibold text-primary-700">
                        {initials(row.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-semibold text-neutral-900">{row.name}</p>
                        <p className="truncate font-sans text-xs text-neutral-500">{row.email}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="font-sans text-xs text-neutral-400">{row.createdAt.slice(0, 10)}</span>
                      {row.repliedAt ? (
                        <span className="rounded-full bg-success-bg px-2.5 py-0.5 font-sans text-xs font-medium text-success">
                          Replied
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning-bg px-2.5 py-0.5 font-sans text-xs font-medium text-warning">
                          Awaiting reply
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-700">
                    {row.message}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleReply(row.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-xs font-semibold text-neutral-700 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                    >
                      <ReplyIcon />
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(row.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-xs font-semibold text-neutral-700 transition-colors hover:border-error hover:bg-error-bg hover:text-error"
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  </div>

                  {row.repliedAt && (
                    <div className="mt-4 flex items-start gap-3 rounded-xl bg-primary-50 p-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 font-display text-xs font-semibold text-white">
                        B
                      </div>
                      <div className="min-w-0">
                        <p className="font-sans text-xs font-medium text-primary-700">
                          Replied on {row.repliedAt.slice(0, 10)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap font-sans text-sm text-neutral-700">{row.replyMessage}</p>
                      </div>
                    </div>
                  )}

                  {openReplyId === row.id && (
                    <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/40 p-3.5">
                      <textarea
                        value={replyDrafts[row.id] ?? ""}
                        onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
                        rows={3}
                        placeholder="Write your reply…"
                        aria-label={`Reply to ${row.name}`}
                        className="w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenReplyId(null)}
                          className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 hover:bg-neutral-50"
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
