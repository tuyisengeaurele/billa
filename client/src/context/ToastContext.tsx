import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  toasts: ToastItem[];
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
  dismiss: (id: string) => void;
  pauseAutoDismiss: (id: string) => void;
  resumeAutoDismiss: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 4;
const SUCCESS_DURATION_MS = 4000;

interface PendingTimer {
  timeoutId: ReturnType<typeof setTimeout>;
  remainingMs: number;
  startedAt: number;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // Tracks each success toast's auto-dismiss timer so hovering/focusing it (in Toast.tsx)
  // can pause the countdown and pick up from where it left off, instead of losing time
  // the user spent reading the toast or reaching for its action button.
  const timers = useRef(new Map<string, PendingTimer>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer.timeoutId);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, delayMs: number) => {
      const timeoutId = setTimeout(() => dismiss(id), delayMs);
      timers.current.set(id, { timeoutId, remainingMs: delayMs, startedAt: Date.now() });
    },
    [dismiss],
  );

  const pauseAutoDismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    clearTimeout(timer.timeoutId);
    const elapsedMs = Date.now() - timer.startedAt;
    timers.current.set(id, { ...timer, remainingMs: Math.max(0, timer.remainingMs - elapsedMs) });
  }, []);

  const resumeAutoDismiss = useCallback(
    (id: string) => {
      const timer = timers.current.get(id);
      if (!timer) return;
      scheduleDismiss(id, timer.remainingMs);
    },
    [scheduleDismiss],
  );

  const push = useCallback(
    (variant: ToastVariant, message: string, action?: ToastAction) => {
      const id = `toast-${nextId.current++}`;
      setToasts((current) => {
        const next = [...current, { id, variant, message, action }];
        return next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next;
      });
      if (variant === "success") {
        scheduleDismiss(id, SUCCESS_DURATION_MS);
      }
    },
    [scheduleDismiss],
  );

  const success = useCallback((message: string, action?: ToastAction) => push("success", message, action), [push]);
  const error = useCallback((message: string) => push("error", message), [push]);

  return (
    <ToastContext.Provider value={{ toasts, success, error, dismiss, pauseAutoDismiss, resumeAutoDismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

const FALLBACK_TOAST: ToastContextValue = {
  toasts: [],
  success: () => {},
  error: () => {},
  dismiss: () => {},
  pauseAutoDismiss: () => {},
  resumeAutoDismiss: () => {},
};

export function useToast(): { success: (message: string, action?: ToastAction) => void; error: (message: string) => void } {
  const ctx = useContext(ToastContext) ?? FALLBACK_TOAST;
  return { success: ctx.success, error: ctx.error };
}

/** Internal — used only by ToastContainer to read/dismiss the active list. */
export function useToastItems(): {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
  pauseAutoDismiss: (id: string) => void;
  resumeAutoDismiss: (id: string) => void;
} {
  const ctx = useContext(ToastContext) ?? FALLBACK_TOAST;
  return {
    toasts: ctx.toasts,
    dismiss: ctx.dismiss,
    pauseAutoDismiss: ctx.pauseAutoDismiss,
    resumeAutoDismiss: ctx.resumeAutoDismiss,
  };
}
