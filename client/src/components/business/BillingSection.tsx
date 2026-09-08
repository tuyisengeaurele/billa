import { useEffect, useState } from "react";
import { PLAN_PRICES, formatRwf } from "@billa/shared";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { LoadErrorBanner } from "../LoadErrorBanner";
import { Spinner } from "../Spinner";

interface BillingStatus {
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: "MONTHLY" | "ANNUAL" | null;
  activeUntil: string;
}

const PLAN_LABELS: Record<"MONTHLY" | "ANNUAL", string> = {
  MONTHLY: `Monthly (${formatRwf(PLAN_PRICES.MONTHLY)})`,
  ANNUAL: `Annual (${formatRwf(PLAN_PRICES.ANNUAL)})`,
};

export function BillingSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [payingPlan, setPayingPlan] = useState<"MONTHLY" | "ANNUAL" | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED" | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(false);
    apiRequest<BillingStatus>("/billing/status")
      .then(setStatus)
      .catch(() => setLoadError(true));
  }, [reloadToken]);

  useEffect(() => {
    if (user?.phone) setPhoneNumber(user.phone);
  }, [user]);

  useEffect(() => {
    if (!paymentId || paymentStatus !== "PENDING") return;
    const interval = setInterval(async () => {
      try {
        const data = await apiRequest<{
          status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
          failureReason?: string | null;
        }>(`/billing/checkout/${paymentId}`);
        setPaymentStatus(data.status);
        setFailureReason(data.failureReason ?? null);
        if (data.status === "SUCCESSFUL") {
          setReloadToken((t) => t + 1);
        }
      } catch {
        // transient network error, keep polling on the next tick
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [paymentId, paymentStatus]);

  async function subscribe(plan: "MONTHLY" | "ANNUAL") {
    setCheckoutError(null);
    setPayingPlan(plan);
    try {
      const data = await apiRequest<{ paymentId: string }>("/billing/checkout", {
        method: "POST",
        body: { plan, phoneNumber },
      });
      setPaymentId(data.paymentId);
      setPaymentStatus("PENDING");
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError
          ? "Couldn't start the payment. Check the number and try again."
          : "Something went wrong. Try again.",
      );
      setPayingPlan(null);
    }
  }

  function retry() {
    setPaymentId(null);
    setPaymentStatus(null);
    setFailureReason(null);
    setPayingPlan(null);
    setCheckoutError(null);
  }

  if (loadError) {
    return (
      <LoadErrorBanner message="Couldn't load your billing status." onRetry={() => setReloadToken((t) => t + 1)} />
    );
  }

  if (!status) {
    return <Spinner />;
  }

  const isActive = new Date(status.activeUntil).getTime() > Date.now();
  const statusText = status.plan
    ? `${PLAN_LABELS[status.plan]}, ${isActive ? "active" : "expired"} until ${new Date(status.activeUntil).toLocaleDateString()}`
    : isActive
      ? `Free trial, active until ${new Date(status.activeUntil).toLocaleDateString()}`
      : "Your free trial has ended.";

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">Billing</h2>

      {checkoutError && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {checkoutError}
        </div>
      )}

      <p className="mt-4 font-sans text-sm text-neutral-600">{statusText}</p>

      {!paymentStatus && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="billingPhone" className="font-sans text-sm font-medium text-neutral-800">
              MTN MoMo phone number
            </label>
            <input
              id="billingPhone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={payingPlan !== null || !phoneNumber.trim()}
              onClick={() => subscribe("MONTHLY")}
              className="rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {payingPlan === "MONTHLY" ? "Sending…" : `Pay ${formatRwf(PLAN_PRICES.MONTHLY)} (Monthly)`}
            </button>
            <button
              type="button"
              disabled={payingPlan !== null || !phoneNumber.trim()}
              onClick={() => subscribe("ANNUAL")}
              className="rounded-lg border border-neutral-200 px-5 py-2.5 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {payingPlan === "ANNUAL" ? "Sending…" : `Pay ${formatRwf(PLAN_PRICES.ANNUAL)} (Annual)`}
            </button>
          </div>
        </div>
      )}

      {paymentStatus === "PENDING" && (
        <div className="mt-4 flex items-center gap-2">
          <Spinner size="sm" />
          <p className="font-sans text-sm text-neutral-600">Check your phone to approve this payment.</p>
        </div>
      )}

      {paymentStatus === "SUCCESSFUL" && (
        <p className="mt-4 font-sans text-sm font-medium text-primary-700">
          Payment received. Thank you for subscribing.
        </p>
      )}

      {(paymentStatus === "FAILED" || paymentStatus === "EXPIRED") && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="font-sans text-sm text-error">
            {paymentStatus === "EXPIRED"
              ? "This payment request expired before it was approved."
              : (failureReason ?? "The payment didn't go through.")}
          </p>
          <button
            type="button"
            onClick={retry}
            className="w-fit rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
