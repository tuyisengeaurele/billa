import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import { Modal } from "./Modal";

const STEPS = [
  {
    title: "Welcome to Billa",
    body: "Everything you need to invoice customers, track what they owe, and get paid, without the bookkeeping overhead.",
  },
  {
    title: "Create your first document",
    body: "Invoices, quotes, proforma invoices, delivery notes, receipts, and credit notes all live under Documents. Start from a blank one or convert a quote straight into an invoice.",
  },
  {
    title: "Keep track of who owes you",
    body: "Receivables lists every outstanding invoice and how overdue it is, so nothing slips through.",
  },
  {
    title: "Add your customers and items",
    body: "Save a customer or catalog item once, then reuse it on every document instead of retyping it.",
  },
  {
    title: "Make it yours",
    body: "Add your logo and brand color in Settings so every document you send looks like it really came from you.",
  },
];

export function ProductTourModal() {
  const { user, refreshAuth } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (user && !user.productTourSeenAt) {
      setIsOpen(true);
    }
  }, [user]);

  async function finish() {
    setIsOpen(false);
    try {
      await apiRequest("/profile/tour-seen", { method: "POST" });
      await refreshAuth();
    } catch {
      // Not fatal: worst case the tour offers to run again next time.
    }
  }

  function next() {
    if (stepIndex === STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  if (!user) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <Modal isOpen={isOpen} onClose={finish} title={step.title}>
      <p className="font-sans text-sm text-neutral-600">{step.body}</p>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 w-1.5 rounded-full ${i === stepIndex ? "bg-primary-500" : "bg-neutral-200"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-4">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={back}
              className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              Back
            </button>
          )}
          <button type="button" onClick={finish} className="font-sans text-sm font-medium text-neutral-500 hover:text-neutral-700">
            Skip
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {isLast ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
