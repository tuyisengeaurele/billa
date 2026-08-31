import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Keeps Tab/Shift+Tab cycling within the dialog instead of escaping into the page behind it.
  useEffect(() => {
    if (!isOpen) return;
    function handleTabTrap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleTabTrap);
    return () => window.removeEventListener("keydown", handleTabTrap);
  }, [isOpen]);

  // Moves focus into the dialog on open, and returns it to whatever had focus before on close.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const target = focusable && focusable.length > 0 ? focusable[0] : panelRef.current;
    target?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-neutral-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              >
                ×
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
