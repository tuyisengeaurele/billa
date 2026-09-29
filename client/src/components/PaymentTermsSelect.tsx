import { addDaysToDate, matchPaymentTerm, PAYMENT_TERM_OPTIONS } from "@billa/shared";

interface PaymentTermsSelectProps {
  label: string;
  issueDate: string;
  dueDate: string;
  onSelect: (dueDate: string) => void;
}

/** Picks a common term (net 30, due on receipt) and turns it into the due date, so nobody counts days by hand. */
export function PaymentTermsSelect({ label, issueDate, dueDate, onSelect }: PaymentTermsSelectProps) {
  const matched = matchPaymentTerm(issueDate, dueDate);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="paymentTerms" className="font-sans text-sm font-medium text-neutral-800">
        {label}
      </label>
      <select
        id="paymentTerms"
        value={matched === null ? "custom" : String(matched)}
        onChange={(event) => {
          if (event.target.value === "custom") return;
          onSelect(addDaysToDate(issueDate, Number(event.target.value)));
        }}
        className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
      >
        {PAYMENT_TERM_OPTIONS.map((option) => (
          <option key={option.days} value={option.days}>
            {option.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
    </div>
  );
}
