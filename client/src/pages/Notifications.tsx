import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { usePageTitle } from "../context/PageTitleContext";
import { apiRequest } from "../lib/apiClient";
import { formatRelativeTime } from "../lib/relativeTime";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function Notifications() {
  usePageTitle("Notifications");
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  function load() {
    setLoadError(false);
    apiRequest<{ results: NotificationRow[] }>("/notifications")
      .then((data) => setNotifications(data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) : prev,
    );
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Not fatal: the row already reflects the intended state locally.
    }
  }

  async function markAllRead() {
    setIsMarkingAll(true);
    try {
      await apiRequest("/notifications/mark-all-read", { method: "POST" });
      setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev));
    } catch {
      setError("Couldn't mark everything as read. Try again.");
    } finally {
      setIsMarkingAll(false);
    }
  }

  const hasUnread = notifications?.some((n) => n.readAt === null) ?? false;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {hasUnread && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={isMarkingAll}
            onClick={markAllRead}
            className="font-sans text-sm font-medium text-primary-500 hover:underline disabled:opacity-50"
          >
            {isMarkingAll ? "Marking…" : "Mark all as read"}
          </button>
        </div>
      )}

      {loadError && <LoadErrorBanner message="Couldn't load your notifications." onRetry={load} />}
      {error && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {error}
        </div>
      )}

      {notifications === null ? (
        <div className="flex flex-col gap-2" aria-label="Loading notifications">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <p className="font-sans text-sm text-neutral-600">Nothing yet. We'll let you know when something happens.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const unread = notification.readAt === null;
            const content = (
              <div
                className={`rounded-xl border border-neutral-200 bg-surface p-4 transition-colors hover:border-neutral-300 ${
                  unread ? "border-l-4 border-l-primary-500" : ""
                }`}
              >
                <p className="font-sans text-sm font-medium text-neutral-900">{notification.title}</p>
                {notification.body && (
                  <p className="mt-1 font-sans text-sm text-neutral-600">{notification.body}</p>
                )}
                <p className="mt-2 font-sans text-xs text-neutral-400" title={new Date(notification.createdAt).toLocaleString()}>
                  {formatRelativeTime(notification.createdAt)}
                </p>
              </div>
            );

            return (
              <li key={notification.id}>
                {notification.link ? (
                  <Link to={notification.link} onClick={() => unread && markRead(notification.id)} className="block">
                    {content}
                  </Link>
                ) : unread ? (
                  <button type="button" onClick={() => markRead(notification.id)} className="block w-full text-left">
                    {content}
                  </button>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
