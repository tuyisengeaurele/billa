import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/apiClient";

export default function BillingCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");

  useEffect(() => {
    const txRef = searchParams.get("tx_ref");
    const transactionId = searchParams.get("transaction_id");
    if (!txRef || !transactionId) {
      setStatus("failed");
      return;
    }
    apiRequest("/billing/verify", { method: "POST", body: { txRef, transactionId } })
      .then(() => setStatus("success"))
      .catch(() => setStatus("failed"));
  }, [searchParams]);

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        {status === "verifying" && <p className="font-sans text-sm text-neutral-600">Confirming your payment…</p>}
        {status === "success" && (
          <>
            <p className="font-sans text-sm text-success">Payment confirmed. Thanks for subscribing.</p>
            <Link to="/settings" className="font-sans text-sm text-primary-500 hover:text-primary-700">
              Back to settings
            </Link>
          </>
        )}
        {status === "failed" && (
          <>
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              We couldn't confirm this payment. If you were charged, contact support.
            </div>
            <Link to="/settings" className="font-sans text-sm text-primary-500 hover:text-primary-700">
              Back to settings
            </Link>
          </>
        )}
      </div>
    </AppLayout>
  );
}
