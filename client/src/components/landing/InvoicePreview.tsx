import { formatRwf } from "@billa/shared";

export function InvoicePreview() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-base font-semibold text-neutral-900">Kigali Traders</span>
        </div>
        <div className="text-right">
          <p className="font-sans text-xs uppercase tracking-wide text-neutral-400">Invoice</p>
          <p className="font-sans text-sm font-semibold text-neutral-900">INV-0004</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 font-sans text-sm text-neutral-600">
        <div className="flex items-center justify-between">
          <span>3 bags of cement</span>
          <span>{formatRwf(45000)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Delivery, Kicukiro</span>
          <span>{formatRwf(5000)}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1 border-t border-neutral-100 pt-4 font-sans text-sm text-neutral-600">
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatRwf(50000)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Tax (18%)</span>
          <span>{formatRwf(9000)}</span>
        </div>
        <div className="flex items-center justify-between font-display text-base font-semibold text-neutral-900">
          <span>Total</span>
          <span>{formatRwf(59000)}</span>
        </div>
      </div>
    </div>
  );
}
