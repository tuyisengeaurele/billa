import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Modal } from "./Modal";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

interface IdleTimeoutModalProps {
  warningAfterMs?: number;
  countdownSeconds?: number;
}

export function IdleTimeoutModal({
  warningAfterMs = 25 * 60 * 1000,
  countdownSeconds = 60,
}: IdleTimeoutModalProps) {
  const { user, logout } = useAuth();
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armWarningTimer = useCallback(() => {
    if (warningTimerRef.current !== null) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => setIsWarningOpen(true), warningAfterMs);
  }, [warningAfterMs]);

  function stayLoggedIn() {
    setIsWarningOpen(false);
    armWarningTimer();
  }

  useEffect(() => {
    if (!user) return;
    armWarningTimer();

    function handleActivity() {
      // Once the warning is showing, only the "I'm still here" button counts
      // as proof of presence, not ambient mouse movement.
      setIsWarningOpen((currentlyWarning) => {
        if (!currentlyWarning) armWarningTimer();
        return currentlyWarning;
      });
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }
    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      if (warningTimerRef.current !== null) clearTimeout(warningTimerRef.current);
    };
  }, [user, armWarningTimer]);

  useEffect(() => {
    if (!isWarningOpen) {
      setSecondsLeft(countdownSeconds);
      return;
    }
    const interval = setInterval(() => {
      setSecondsLeft((remaining) => {
        if (remaining <= 1) {
          clearInterval(interval);
          logout();
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isWarningOpen, countdownSeconds, logout]);

  if (!user) return null;

  return (
    <Modal isOpen={isWarningOpen} onClose={stayLoggedIn} title="Still there?">
      <p className="font-sans text-sm text-neutral-600">
        You've been inactive for a while. For your security, you'll be signed out in{" "}
        <span className="font-semibold text-neutral-900 tabular-nums">{secondsLeft}s</span>.
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={stayLoggedIn}
          className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          I'm still here
        </button>
      </div>
    </Modal>
  );
}
