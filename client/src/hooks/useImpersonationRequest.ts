import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "../lib/apiClient";

export type ImpersonationRequestStatus = "idle" | "pending" | "redeeming" | "denied" | "expired" | "error";

const POLL_INTERVAL_MS = 2000;

export function useImpersonationRequest() {
  const [status, setStatus] = useState<ImpersonationRequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const redeem = useCallback(async (id: string) => {
    setStatus("redeeming");
    try {
      await apiRequest(`/impersonation-requests/${id}/redeem`, { method: "POST" });
      // A hard navigation, not React Router's navigate() - AppLayout and
      // everything it renders (BusinessSwitcher, NotificationBell, the
      // sidebar) stay mounted across an in-app route change and only fetch
      // their own data once, on mount. Switching who's actually signed in
      // needs everything to refetch, not just AuthContext's own state - the
      // same reason BusinessSwitcher's own switchTo() does this instead of a
      // soft navigate. Without it, impersonation "worked" per the banner but
      // every other panel kept showing the admin's own stale data until a
      // manual reload.
      window.location.href = "/dashboard";
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't start impersonation. Try again.");
    }
  }, []);

  const checkStatus = useCallback(
    async (id: string) => {
      try {
        const data = await apiRequest<{ status: string }>(`/impersonation-requests/${id}`);
        if (data.status === "APPROVED") {
          stopPolling();
          await redeem(id);
        } else if (data.status === "DENIED") {
          stopPolling();
          setStatus("denied");
        } else if (data.status === "EXPIRED") {
          stopPolling();
          setStatus("expired");
        }
      } catch {
        stopPolling();
        setStatus("error");
        setErrorMessage("Couldn't check the request status.");
      }
    },
    [redeem, stopPolling],
  );

  const start = useCallback(
    async (targetUserId: string) => {
      setErrorMessage(null);
      setStatus("pending");
      try {
        const data = await apiRequest<{ request: { id: string } }>("/impersonation-requests", {
          method: "POST",
          body: { targetUserId },
        });
        requestIdRef.current = data.request.id;
        await checkStatus(data.request.id);
        stopPolling();
        intervalRef.current = setInterval(() => {
          if (requestIdRef.current) checkStatus(requestIdRef.current);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof ApiError && err.status === 409
            ? "You already have a pending impersonation request."
            : "Couldn't start impersonation. Try again.",
        );
      }
    },
    [checkStatus, stopPolling],
  );

  const override = useCallback(async (overrideReason: string) => {
    const id = requestIdRef.current;
    if (!id) return;
    setStatus("redeeming");
    try {
      await apiRequest(`/impersonation-requests/${id}/override`, { method: "POST", body: { overrideReason } });
      // Hard navigation - see the matching comment in redeem() above.
      window.location.href = "/dashboard";
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't override. Try again.");
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    requestIdRef.current = null;
    setStatus("idle");
    setErrorMessage(null);
  }, [stopPolling]);

  return { status, errorMessage, start, override, reset };
}
