import { formatRwf } from "@billa/shared";

interface PreviewLine {
  label: string;
  amount: number;
}

interface DocumentPreviewCardProps {
  typeLabel: string;
  number: string;
  businessName: string;
  lines: PreviewLine[];
  subtotal: number;
  taxAmount?: number;
  total: number;
  className?: string;
}

export function DocumentPreviewCard({
  typeLabel,
  number,
  businessName,
  lines,
  subtotal,
  taxAmount,
  total,
  className = "",
}: DocumentPreviewCardProps) {
  return (
    <div className={`w-72 shrink-0 rounded-2xl border border-neutral-200 bg-surface p-6 shadow-xl sm:w-80 ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-base font-semibold text-neutral-900">{businessName}</span>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-sans text-xs uppercase tracking-wide text-neutral-400">{typeLabel}</p>
          <p className="font-sans text-sm font-semibold text-neutral-900">{number}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 font-sans text-sm text-neutral-600">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between">
            <span>{line.label}</span>
            <span>{formatRwf(line.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-1 border-t border-neutral-100 pt-4 font-sans text-sm text-neutral-600">
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatRwf(subtotal)}</span>
        </div>
        {taxAmount !== undefined && (
          <div className="flex items-center justify-between">
            <span>Tax (18%)</span>
            <span>{formatRwf(taxAmount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between font-display text-base font-semibold text-neutral-900">
          <span>Total</span>
          <span>{formatRwf(total)}</span>
        </div>
      </div>
    </div>
  );
}
