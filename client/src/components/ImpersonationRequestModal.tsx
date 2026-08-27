import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";
import { Modal } from "./Modal";

interface PendingRequest {
  id: string;
  requesterName: string;
  reason: string | null;
}

const POLL_INTERVAL_MS = 4000;

export function ImpersonationRequestModal() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [isResponding, setIsResponding] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiRequest<{ request: PendingRequest | null }>("/impersonation-requests/pending-for-me");
        if (!cancelled) setPending(data.request);
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

  async function respond(action: "approve" | "deny") {
    if (!pending) return;
    setIsResponding(true);
    try {
      await apiRequest(`/impersonation-requests/${pending.id}/${action}`, { method: "POST" });
      setPending(null);
    } catch {
      // Leave the modal open so they can try again.
    } finally {
      setIsResponding(false);
    }
  }

  return (
    <Modal isOpen={pending !== null} onClose={() => respond("deny")} title="Account access request">
      {pending && (
        <>
          <p className="font-sans text-sm text-neutral-600">
            <strong className="text-neutral-900">{pending.requesterName}</strong> wants to view your account to help
            with something.
          </p>
          {pending.reason && (
            <p className="mt-2 rounded-lg bg-neutral-50 px-3.5 py-2.5 font-sans text-sm text-neutral-700">
              "{pending.reason}"
            </p>
          )}
          <p className="mt-3 font-sans text-sm text-neutral-500">
            They'll be able to see and act as you until they stop. You can end it at any time from the banner at the
            top of your screen.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={isResponding}
              onClick={() => respond("deny")}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Deny
            </button>
            <button
              type="button"
              disabled={isResponding}
              onClick={() => respond("approve")}
              className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Allow
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
