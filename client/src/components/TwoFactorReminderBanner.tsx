import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Session-only, not a permanent "never ask again" - two-factor is optional
// for a regular account (admins already have it enforced before they can
// reach the app at all, see AdminRoute), so this is a recurring nudge, not
// a one-time onboarding step like ProductTourModal's productTourSeenAt.
// Dismissing it just quiets this one tab for the rest of this session; it's
// back next time they sign in.
const DISMISS_KEY = "billa:2fa-reminder-dismissed";

export function TwoFactorReminderBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user || user.totpEnabled) {
      setDismissed(true);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies/storage) -
      // just show the banner every load in that case rather than crash.
      setDismissed(false);
    }
  }, [user]);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not fatal: worst case it shows again on the next render.
    }
  }

  if (!user || user.totpEnabled || dismissed) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 bg-warning-bg px-4 py-2 font-sans text-sm font-medium text-warning"
      role="status"
    >
      <span>Add two-factor authentication to keep your account more secure.</span>
      <Link to="/settings" className="underline hover:no-underline">
        Set up now
      </Link>
      <button type="button" onClick={dismiss} className="underline hover:no-underline">
        Dismiss
      </button>
    </div>
  );
}
