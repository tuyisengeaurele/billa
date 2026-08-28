import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 4;
const SUCCESS_DURATION_MS = 4000;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `toast-${nextId.current++}`;
      setToasts((current) => {
        const next = [...current, { id, variant, message }];
        return next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next;
      });
      if (variant === "success") {
        setTimeout(() => dismiss(id), SUCCESS_DURATION_MS);
      }
    },
    [dismiss],
  );

  const success = useCallback((message: string) => push("success", message), [push]);
  const error = useCallback((message: string) => push("error", message), [push]);

  return <ToastContext.Provider value={{ toasts, success, error, dismiss }}>{children}</ToastContext.Provider>;
}

const FALLBACK_TOAST: ToastContextValue = {
  toasts: [],
  success: () => {},
  error: () => {},
  dismiss: () => {},
};

export function useToast(): { success: (message: string) => void; error: (message: string) => void } {
  const ctx = useContext(ToastContext) ?? FALLBACK_TOAST;
  return { success: ctx.success, error: ctx.error };
}

/** Internal — used only by ToastContainer to read/dismiss the active list. */
export function useToastItems(): { toasts: ToastItem[]; dismiss: (id: string) => void } {
  const ctx = useContext(ToastContext) ?? FALLBACK_TOAST;
  return { toasts: ctx.toasts, dismiss: ctx.dismiss };
}
