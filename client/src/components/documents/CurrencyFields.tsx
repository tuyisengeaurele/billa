import { CURRENCIES, currencyName, type Currency } from "@billa/shared";

interface CurrencyFieldsProps {
  currency: Currency;
  // RWF for one whole unit of the currency, as typed.
  rate: string;
  // A document that refers to an invoice keeps the invoice's currency.
  locked?: boolean;
  onCurrencyChange: (currency: Currency) => void;
  onRateChange: (rate: string) => void;
  error?: string | null;
}

const FIELD =
  "rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50 disabled:text-neutral-500";

export function CurrencyFields({ currency, rate, locked, onCurrencyChange, onRateChange, error }: CurrencyFieldsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="currency" className="font-sans text-sm font-medium text-neutral-800">
        Currency
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id="currency"
          value={currency}
          disabled={locked}
          onChange={(event) => onCurrencyChange(event.target.value as Currency)}
          className={FIELD}
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code} ({currencyName(code)})
            </option>
          ))}
        </select>
        {currency !== "RWF" && (
          <label className="flex items-center gap-2 font-sans text-sm text-neutral-700">
            <span>1 {currency} =</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Exchange rate: RWF for 1 ${currency}`}
              placeholder="0"
              value={rate}
              disabled={locked}
              onChange={(event) => {
                const next = event.target.value;
                if (/^[0-9]*[.]?[0-9]{0,4}$/.test(next)) onRateChange(next);
              }}
              className={`${FIELD} w-28`}
            />
            <span>RWF</span>
          </label>
        )}
      </div>
      {locked && (
        <p className="font-sans text-xs text-neutral-500">Kept the same as the invoice this document is for.</p>
      )}
      {currency !== "RWF" && !error && (
        <p className="font-sans text-xs text-neutral-500">
          The rate is saved with this document and used to show it in RWF in your reports.
        </p>
      )}
      {error && (
        <p className="font-sans text-xs text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
