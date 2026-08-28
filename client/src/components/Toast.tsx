import { motion } from "framer-motion";
import type { ToastItem } from "../context/ToastContext";

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const isError = toast.variant === "error";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`flex w-80 items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
        isError ? "border-transparent bg-error-bg text-error" : "border-neutral-200 bg-surface text-neutral-900"
      }`}
    >
      <p className="flex-1 font-sans text-sm font-medium">{toast.message}</p>
      {isError && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 text-lg leading-none text-error transition-opacity hover:opacity-70"
        >
          ×
        </button>
      )}
    </motion.div>
  );
}
