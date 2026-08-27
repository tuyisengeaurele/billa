import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationBellProps {
  allHref: string;
}

const POLL_INTERVAL_MS = 20000;

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 17a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

export function NotificationBell({ allHref }: NotificationBellProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiRequest<{ results: NotificationRow[]; unreadCount: number }>("/notifications");
        if (!cancelled) {
          setNotifications(data.results);
          setUnreadCount(data.unreadCount);
        }
      } catch {
        // Transient network errors shouldn't interrupt whatever the user is doing.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "POST" });
    } catch {
      // The next poll will resync if this failed.
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await apiRequest("/notifications/mark-all-read", { method: "POST" });
    } catch {
      // The next poll will resync if this failed.
    }
  }

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-error" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-neutral-200 bg-surface p-1.5 shadow-lg"
        >
          <div className="flex items-center justify-between px-3 py-2">
            <p className="font-sans text-sm font-semibold text-neutral-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="font-sans text-xs font-medium text-primary-500 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-4 font-sans text-sm text-neutral-500">Nothing yet.</p>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {notifications.slice(0, 8).map((notification) => {
                const unread = notification.readAt === null;
                const content = (
                  <>
                    <p className="font-sans text-sm font-medium text-neutral-900">{notification.title}</p>
                    {notification.body && (
                      <p className="mt-0.5 line-clamp-2 font-sans text-xs text-neutral-500">{notification.body}</p>
                    )}
                    <p className="mt-1 font-sans text-xs text-neutral-400">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </>
                );

                const rowClassName = `block rounded-lg px-3 py-2.5 transition-colors hover:bg-neutral-50 ${
                  unread ? "bg-primary-50" : ""
                }`;

                return (
                  <li key={notification.id}>
                    {notification.link ? (
                      <Link
                        to={notification.link}
                        role="menuitem"
                        onClick={() => {
                          if (unread) markRead(notification.id);
                          setIsOpen(false);
                        }}
                        className={rowClassName}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => markRead(notification.id)}
                        className={`w-full text-left ${rowClassName}`}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-1 border-t border-neutral-100 pt-1">
            <Link
              to={allHref}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="block rounded-lg px-3 py-2 text-center font-sans text-sm font-medium text-primary-500 hover:bg-neutral-50"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
