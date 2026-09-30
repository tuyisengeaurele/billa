import { useEffect, useState } from "react";
import { currencyDecimals, minorToMajorText, parseMajorAmount, type Currency } from "@billa/shared";

interface MoneyInputProps {
  currency: Currency;
  // The amount in the currency's smallest unit: cents for USD, whole francs for RWF.
  value: number;
  onChange: (minor: number) => void;
  "aria-label": string;
  className?: string;
  placeholder?: string;
}

/** A price box that is typed in whole units (12.50) and reports the smallest unit (1250). */
export function MoneyInput({ currency, value, onChange, className, placeholder = "0", ...rest }: MoneyInputProps) {
  const decimals = currencyDecimals(currency);
  const [text, setText] = useState(() => minorToMajorText(value, currency));

  // Follow the value when it changes from outside (an item picked, the currency switched), but not
  // while what is typed already means the same amount, so "12." is not snapped to "12" mid-keystroke.
  useEffect(() => {
    const typed = parseMajorAmount(text, currency) ?? 0;
    if (typed !== value) setText(minorToMajorText(value, currency));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency]);

  return (
    <input
      type="text"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      aria-label={rest["aria-label"]}
      placeholder={placeholder}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        const pattern = decimals > 0 ? new RegExp(`^[0-9]*[.]?[0-9]{0,${decimals}}$`) : /^[0-9]*$/;
        if (!pattern.test(next.replace(/,/g, ""))) return;
        setText(next);
        onChange(parseMajorAmount(next, currency) ?? 0);
      }}
      onBlur={() => setText(minorToMajorText(value, currency))}
      className={className}
    />
  );
}
