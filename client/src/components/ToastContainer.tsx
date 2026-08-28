import { AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useToastItems } from "../context/ToastContext";
import { Toast } from "./Toast";

export function ToastContainer() {
  const { toasts, dismiss } = useToastItems();

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
