import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";

interface BillingStatus {
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: "MONTHLY" | "ANNUAL" | null;
  activeUntil: string;
}

const PLAN_LABELS: Record<"MONTHLY" | "ANNUAL", string> = {
  MONTHLY: "Monthly (6,500 RWF)",
  ANNUAL: "Annual (65,000 RWF)",
};

export function BillingSection() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState<"MONTHLY" | "ANNUAL" | null>(null);

  useEffect(() => {
    apiRequest<BillingStatus>("/billing/status")
      .then(setStatus)
      .catch(() => setLoadError(true));
  }, []);

  async function subscribe(plan: "MONTHLY" | "ANNUAL") {
    setCheckoutError(null);
    setIsRedirecting(plan);
    try {
      const { link } = await apiRequest<{ link: string }>("/billing/checkout", { method: "POST", body: { plan } });
      window.location.href = link;
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError ? "Couldn't start checkout. Try again." : "Something went wrong. Try again.",
      );
      setIsRedirecting(null);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
        Couldn't load your billing status. Try again.
      </div>
    );
  }

  if (!status) {
    return <p className="font-sans text-sm text-neutral-600">Loading…</p>;
  }

  const isActive = new Date(status.activeUntil).getTime() > Date.now();
  const statusText = status.plan
    ? `${PLAN_LABELS[status.plan]}, ${isActive ? "active" : "expired"} until ${new Date(status.activeUntil).toLocaleDateString()}`
    : isActive
      ? `Free trial, active until ${new Date(status.activeUntil).toLocaleDateString()}`
      : "Your free trial has ended.";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">Billing</h2>

      {checkoutError && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {checkoutError}
        </div>
      )}

      <p className="mt-4 font-sans text-sm text-neutral-600">{statusText}</p>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={isRedirecting !== null}
          onClick={() => subscribe("MONTHLY")}
          className="rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isRedirecting === "MONTHLY" ? "Redirecting…" : "Subscribe monthly"}
        </button>
        <button
          type="button"
          disabled={isRedirecting !== null}
          onClick={() => subscribe("ANNUAL")}
          className="rounded-lg border border-neutral-200 px-5 py-2.5 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isRedirecting === "ANNUAL" ? "Redirecting…" : "Subscribe annually"}
        </button>
      </div>
    </section>
  );
}
