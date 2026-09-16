import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";

interface ActiveImpersonation {
  adminName: string;
}

// Matches ImpersonationRequestModal's own cadence - this is just as rare an
// event, and there's no reason to poll it any more eagerly.
const POLL_INTERVAL_MS = 20000;

// The admin's "Viewing as X" banner (see AppLayout.tsx) only ever shows on
// the admin's own browser - the account actually being impersonated has no
// way to know, since that's a claim on the admin's signed session cookie,
// not anything this account's own separate session carries. This polls a
// dedicated endpoint that checks the database instead (see
// impersonation-requests.ts's GET /active-for-me) and gives this account a
// way to end it themselves.
export function ActiveImpersonationBanner() {
  const { user, impersonating } = useAuth();
  const [active, setActive] = useState<ActiveImpersonation | null>(null);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    // While this session is itself the one doing the impersonating, its own
    // userId (per the JWT) *is* the target's - polling here would just
    // reflect the admin's own "Viewing as X" session back at them, showing a
    // second, redundant "end this" banner right next to the one AppLayout
    // already renders for that exact case.
    if (!user || impersonating) {
      setActive(null);
      return;
    }
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiRequest<{ active: ActiveImpersonation | null }>("/impersonation-requests/active-for-me");
        if (!cancelled) setActive(data.active);
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

  async function handleEnd() {
    setIsEnding(true);
    try {
      await apiRequest("/impersonation-requests/end-active", { method: "POST" });
      setActive(null);
    } catch {
      // Leave the banner up so they can try again.
    } finally {
      setIsEnding(false);
    }
  }

  if (!active) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 bg-warning-bg px-4 py-2 font-sans text-sm font-medium text-warning"
      role="status"
    >
      <span>{active.adminName} is currently viewing your account.</span>
      <button
        type="button"
        onClick={handleEnd}
        disabled={isEnding}
        className="underline hover:no-underline disabled:opacity-50"
      >
        {isEnding ? "Ending…" : "End this"}
      </button>
    </div>
  );
}
