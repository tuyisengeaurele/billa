import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";

interface Announcement {
  id: string;
  message: string;
}

const DISMISSED_KEY = "billa_dismissed_announcement_id";

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    apiRequest<{ announcement: Announcement | null }>("/announcements/active")
      .then((data) => {
        setAnnouncement(data.announcement);
        setDismissed(data.announcement ? localStorage.getItem(DISMISSED_KEY) === data.announcement.id : false);
      })
      .catch(() => {});
  }, []);

  if (!announcement || dismissed) return null;

  function handleDismiss() {
    if (!announcement) return;
    localStorage.setItem(DISMISSED_KEY, announcement.id);
    setDismissed(true);
  }

  return (
    <div
      className="flex items-center justify-center gap-3 bg-primary-100 px-4 py-2 font-sans text-sm font-medium text-primary-700"
      role="status"
    >
      <span>{announcement.message}</span>
      <button type="button" onClick={handleDismiss} className="underline hover:no-underline">
        Dismiss
      </button>
    </div>
  );
}
