import { useEffect, useState } from "react";
import { LoadErrorBanner } from "../../components/LoadErrorBanner";
import { usePageTitle } from "../../context/PageTitleContext";
import { useToast } from "../../context/ToastContext";
import { apiRequest } from "../../lib/apiClient";

interface AnnouncementRow {
  id: string;
  message: string;
  active: boolean;
  createdAt: string;
}

const ANNOUNCEMENT_MAX_LENGTH = 500;

export default function AdminAnnouncements() {
  usePageTitle("Announcements");
  const toast = useToast();
  const [results, setResults] = useState<AnnouncementRow[] | null>(null);
  const [message, setMessage] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoadError(false);
    apiRequest<{ results: AnnouncementRow[] }>("/admin/announcements")
      .then((data) => setResults(data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setIsPosting(true);
    try {
      await apiRequest("/admin/announcements", { method: "POST", body: { message: message.trim() } });
      setMessage("");
      load();
      toast.success("Announcement posted");
    } catch {
      setError("Couldn't post the announcement. Try again.");
    } finally {
      setIsPosting(false);
    }
  }

  async function handleDeactivate(id: string) {
    setError(null);
    setDeactivatingId(id);
    try {
      await apiRequest(`/admin/announcements/${id}/deactivate`, { method: "POST" });
      load();
      toast.success("Announcement deactivated");
    } catch {
      setError("Couldn't deactivate the announcement. Try again.");
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
      <div className="flex flex-col gap-6">
        {loadError && <LoadErrorBanner message="Couldn't load announcements." onRetry={load} />}
        {error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Post a new announcement</h2>
          <p className="mt-1 font-sans text-sm text-neutral-600">
            Shows as a dismissible banner to every signed-in user. Posting a new one replaces the current one.
          </p>
          <form onSubmit={handlePost} className="mt-4 flex flex-col gap-3">
            <label htmlFor="announcementMessage" className="font-sans text-sm font-medium text-neutral-800">
              Message
            </label>
            <textarea
              id="announcementMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={ANNOUNCEMENT_MAX_LENGTH}
              rows={3}
              className="w-full resize-none rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <span
              className={`self-end font-sans text-xs tabular-nums ${
                message.length >= ANNOUNCEMENT_MAX_LENGTH
                  ? "text-error"
                  : message.length >= ANNOUNCEMENT_MAX_LENGTH * 0.9
                    ? "text-warning"
                    : "text-neutral-400"
              }`}
            >
              {message.length}/{ANNOUNCEMENT_MAX_LENGTH}
            </span>
            <button
              type="submit"
              disabled={isPosting || !message.trim()}
              className="self-start rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPosting ? "Posting…" : "Post"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">History</h2>
          {results === null ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading announcements">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">No announcements yet.</p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {results.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-4"
                >
                  <div>
                    <p className="font-sans text-sm text-neutral-900">{a.message}</p>
                    <p className="mt-1 font-sans text-xs text-neutral-500">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                  {a.active && (
                    <button
                      type="button"
                      disabled={deactivatingId === a.id}
                      onClick={() => handleDeactivate(a.id)}
                      className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deactivatingId === a.id ? "Deactivating…" : "Deactivate"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
  );
}
