import { useState } from "react";
import {
  currencyDecimals,
  formatMoney,
  MAX_INSTALLMENTS,
  percentOfTotal,
  splitEvenly,
  type Currency,
} from "@billa/shared";
import { MoneyInput } from "../MoneyInput";

export interface PlanRow {
  label: string;
  amount: number;
  dueDate: string;
}

interface InstallmentsEditorProps {
  // What the invoice comes to, from its line items.
  total: number;
  issueDate: string;
  // Amounts are in the smallest unit of this currency. RWF when left out.
  currency?: Currency;
  rows: PlanRow[];
  onChange: (rows: PlanRow[]) => void;
}

/** The rows as they will be saved: every one as typed, except the last, which is always what is left of the total. */
export function withBalance(rows: PlanRow[], total: number): PlanRow[] {
  const earlier = rows.slice(0, -1);
  const spent = earlier.reduce((sum, row) => sum + row.amount, 0);
  return rows.map((row, index) => (index === rows.length - 1 ? { ...row, amount: total - spent } : row));
}

const INPUT =
  "w-full rounded-lg border border-neutral-200 bg-surface px-3 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";
const READONLY = `${INPUT} bg-neutral-50 text-neutral-600`;

function percentText(amount: number, total: number): string {
  if (total <= 0 || amount <= 0) return "";
  return String(Math.round((amount / total) * 1000) / 10);
}

export function InstallmentsEditor({ total, issueDate, currency = "RWF", rows, onChange }: InstallmentsEditorProps) {
  // While a percentage is being typed ("33." on the way to "33.3") keep the text as typed instead of
  // snapping it back to the value worked out from the amount.
  const [percentDrafts, setPercentDrafts] = useState<Record<number, string>>({});
  const balanceIndex = rows.length - 1;
  const saved = withBalance(rows, total);
  const earlierSum = rows.slice(0, -1).reduce((sum, row) => sum + row.amount, 0);
  const overspent = total > 0 && earlierSum >= total;
  const missingAmount = rows.slice(0, -1).some((row) => row.amount <= 0);

  function update(index: number, change: Partial<PlanRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }

  function addInstalment() {
    if (rows.length >= MAX_INSTALLMENTS) return;
    const next = [...rows];
    next.splice(balanceIndex, 0, { label: "", amount: 0, dueDate: rows[balanceIndex]!.dueDate });
    onChange(next);
  }

  function removeInstalment(index: number) {
    if (rows.length <= 2) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  function splitEvenlyAcross() {
    const amounts = splitEvenly(total, rows.length);
    onChange(rows.map((row, index) => (index === balanceIndex ? row : { ...row, amount: amounts[index]! })));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2rem] gap-3 font-sans text-xs font-medium text-neutral-500 md:grid">
        <span>Name</span>
        <span>Amount ({currency})</span>
        <span>% of total</span>
        <span>Due date</span>
        <span />
      </div>

      {rows.map((row, index) => {
        const isBalance = index === balanceIndex;
        const number = index + 1;
        const shownAmount = isBalance ? saved[index]!.amount : row.amount;
        return (
          <div
            key={index}
            className="grid grid-cols-2 items-center gap-3 rounded-lg border border-neutral-100 p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2rem] md:border-0 md:p-0"
          >
            <input
              type="text"
              aria-label={`Name of instalment ${number}`}
              placeholder={isBalance ? "Balance" : "Name (optional)"}
              maxLength={40}
              value={row.label}
              onChange={(event) => update(index, { label: event.target.value })}
              className={`${INPUT} col-span-2 md:col-span-1`}
            />
            {isBalance ? (
              <input
                type="text"
                readOnly
                aria-label={`Amount for instalment ${number}`}
                value={(shownAmount / 10 ** currencyDecimals(currency)).toLocaleString("en-US", {
                  minimumFractionDigits: currencyDecimals(currency),
                  maximumFractionDigits: currencyDecimals(currency),
                })}
                className={READONLY}
              />
            ) : (
              <MoneyInput
                aria-label={`Amount for instalment ${number}`}
                currency={currency}
                value={row.amount}
                onChange={(minor) => {
                  setPercentDrafts({});
                  update(index, { amount: minor });
                }}
                className={INPUT}
              />
            )}
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Percent for instalment ${number}`}
              placeholder="%"
              readOnly={isBalance}
              value={isBalance ? percentText(shownAmount, total) : (percentDrafts[index] ?? percentText(row.amount, total))}
              onChange={(event) => {
                if (isBalance) return;
                const text = event.target.value.replace(/[^\d.]/g, "");
                setPercentDrafts({ [index]: text });
                update(index, { amount: text && Number(text) > 0 ? percentOfTotal(total, Number(text)) : 0 });
              }}
              onBlur={() => setPercentDrafts({})}
              className={isBalance ? READONLY : INPUT}
            />
            <input
              type="date"
              aria-label={`Due date of instalment ${number}`}
              min={issueDate}
              value={row.dueDate}
              onChange={(event) => update(index, { dueDate: event.target.value })}
              className={INPUT}
            />
            {!isBalance && rows.length > 2 ? (
              <button
                type="button"
                aria-label={`Remove instalment ${number}`}
                onClick={() => removeInstalment(index)}
                className="justify-self-end rounded-lg px-2 py-1.5 font-sans text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-error"
              >
                ×
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addInstalment}
          disabled={rows.length >= MAX_INSTALLMENTS}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add instalment
        </button>
        <button
          type="button"
          onClick={splitEvenlyAcross}
          disabled={total <= 0}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Split evenly
        </button>
      </div>

      {total <= 0 ? (
        <p className="font-sans text-sm text-neutral-500">Add your line items first, then set up the instalments.</p>
      ) : overspent ? (
        <p className="font-sans text-sm text-error" role="alert">
          Leave something for the last instalment. The earlier ones already reach {formatMoney(total, currency)}.
        </p>
      ) : missingAmount ? (
        <p className="font-sans text-sm text-neutral-500">Enter an amount for each instalment before the last.</p>
      ) : (
        <p className="font-sans text-sm text-neutral-500">The instalments add up to the total of {formatMoney(total, currency)}.</p>
      )}
    </div>
  );
}
