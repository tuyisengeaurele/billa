import { useEffect, useState } from "react";
import { formatRwf } from "@billa/shared";
import { apiRequest } from "../../lib/apiClient";

interface CreditLimitWarningProps {
  customerId: string;
  // What this invoice adds to what the customer already owes.
  invoiceTotal: number;
}

interface CustomerCredit {
  name: string;
  creditLimit: number | null;
  outstandingBalance: number;
}

/**
 * A heads-up, never a block: if the customer has a credit limit and this invoice would take
 * what they owe past it, say so before the invoice goes out. Renders nothing otherwise.
 */
export function CreditLimitWarning({ customerId, invoiceTotal }: CreditLimitWarningProps) {
  const [credit, setCredit] = useState<CustomerCredit | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCredit(null);
    if (!customerId) return;
    apiRequest<{ customer: CustomerCredit }>(`/customers/${customerId}`)
      .then((data) => {
        if (!cancelled) setCredit(data.customer);
      })
      .catch(() => {
        // The warning is a convenience; a failed lookup just means no warning.
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!credit || credit.creditLimit === null) return null;
  const wouldOwe = credit.outstandingBalance + invoiceTotal;
  if (wouldOwe <= credit.creditLimit) return null;

  return (
    <div className="rounded-lg bg-warning-bg px-4 py-3 font-sans text-sm text-warning" role="status">
      {credit.name} already owes {formatRwf(credit.outstandingBalance)}. With this invoice they would owe{" "}
      {formatRwf(wouldOwe)}, which is over their {formatRwf(credit.creditLimit)} limit.
    </div>
  );
}
