import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatRwf, PAYMENT_METHODS, type PaymentMethod } from "@billa/shared";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
import { usePageTitle } from "../context/PageTitleContext";
import { useToast } from "../context/ToastContext";
import { apiRequest, ApiError } from "../lib/apiClient";
import { ariaSortValue } from "../lib/ariaSort";

interface ReceivableRow {
  id: string;
  number: string | null;
  customerName: string;
  total: number;
  amountOwed: number;
  dueDate: string | null;
  daysOverdue: number;
  agingBucket: "current" | "0-30" | "31-60" | "61-90" | "90+";
}

const BUCKET_LABELS: Record<ReceivableRow["agingBucket"], string> = {
  current: "Current",
  "0-30": "0-30 days",
  "31-60": "31-60 days",
  "61-90": "61-90 days",
  "90+": "90+ days",
};

const BUCKET_COLORS: Record<ReceivableRow["agingBucket"], string> = {
  current: "bg-neutral-100 text-neutral-600",
  "0-30": "bg-amber-100 text-amber-700",
  "31-60": "bg-orange-100 text-orange-700",
  "61-90": "bg-red-100 text-red-700",
  "90+": "bg-red-200 text-red-800",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

// Ordered least to most severe, so sorting "Aging" ascending reads as a
// natural escalation and descending surfaces the most overdue accounts first.
const BUCKET_SEVERITY: Record<ReceivableRow["agingBucket"], number> = {
  current: 0,
  "0-30": 1,
  "31-60": 2,
  "61-90": 3,
  "90+": 4,
};

type SortBy = "customerName" | "dueDate" | "aging" | "amountOwed";
type BucketFilter = "all" | ReceivableRow["agingBucket"];

export default function Receivables() {
  usePageTitle("Accounts receivable");
  const toast = useToast();
  const [results, setResults] = useState<ReceivableRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<ReceivableRow | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<ReceivableRow | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [generateReceipt, setGenerateReceipt] = useState(true);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [writeOffReason, setWriteOffReason] = useState("");
  const [isSavingWriteOff, setIsSavingWriteOff] = useState(false);
  const [writeOffError, setWriteOffError] = useState<string | null>(null);

  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("dueDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  function toggleSort(column: SortBy) {
    setSortBy((current) => {
      if (current === column) {
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
      } else {
        setSortOrder("asc");
      }
      return column;
    });
  }

  const filteredResults = (results ?? []).filter((row) => bucketFilter === "all" || row.agingBucket === bucketFilter);
  const displayedResults = [...filteredResults].sort((a, b) => {
    let comparison: number;
    if (sortBy === "customerName") comparison = a.customerName.localeCompare(b.customerName);
    else if (sortBy === "dueDate") comparison = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    else if (sortBy === "aging") comparison = BUCKET_SEVERITY[a.agingBucket] - BUCKET_SEVERITY[b.agingBucket];
    else comparison = a.amountOwed - b.amountOwed;
    return sortOrder === "asc" ? comparison : -comparison;
  });

  function load() {
    setLoadError(false);
    apiRequest<{ results: ReceivableRow[] }>("/receivables")
      .then((data) => setResults(data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    load();
  }, []);

  function openPaymentModal(row: ReceivableRow) {
    setPaymentTarget(row);
    setAmount(String(row.amountOwed));
    setMethod("CASH");
    setPaidOn(new Date().toISOString().slice(0, 10));
    setGenerateReceipt(true);
    setReferenceNumber("");
    setPayerName("");
    setReceiptImageUrl(null);
    setPaymentError(null);
  }

  async function handleReceiptFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPaymentError(null);
    setIsUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append("receipt", file);
      const uploaded = await apiRequest<{ url: string }>("/documents/payments/receipt", {
        method: "POST",
        body: formData,
      });
      setReceiptImageUrl(uploaded.url);
    } catch {
      setPaymentError("Couldn't upload that photo. Try again.");
    } finally {
      setIsUploadingReceipt(false);
    }
  }

  async function submitPayment() {
    if (!paymentTarget) return;
    setIsSavingPayment(true);
    setPaymentError(null);
    try {
      await apiRequest(`/documents/${paymentTarget.id}/payments`, {
        method: "POST",
        body: {
          amount: Number(amount),
          method,
          paidOn,
          generateReceipt,
          referenceNumber: referenceNumber.trim() || undefined,
          payerName: payerName.trim() || undefined,
          receiptImageUrl: receiptImageUrl ?? undefined,
        },
      });
      setPaymentTarget(null);
      load();
      toast.success("Payment recorded");
    } catch (err) {
      setPaymentError(
        err instanceof ApiError ? "Couldn't record this payment. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSavingPayment(false);
    }
  }

  function openWriteOffModal(row: ReceivableRow) {
    setWriteOffTarget(row);
    setWriteOffReason("");
    setWriteOffError(null);
  }

  async function submitWriteOff() {
    if (!writeOffTarget) return;
    setIsSavingWriteOff(true);
    setWriteOffError(null);
    try {
      await apiRequest(`/documents/${writeOffTarget.id}/write-off`, {
        method: "POST",
        body: { writeOffReason },
      });
      setWriteOffTarget(null);
      load();
      toast.success("Invoice written off");
    } catch (err) {
      setWriteOffError(
        err instanceof ApiError ? "Couldn't write off this invoice. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSavingWriteOff(false);
    }
  }

  const totalOwed = filteredResults.reduce((sum, row) => sum + row.amountOwed, 0);

  return (
    <>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {results && results.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 font-sans text-sm text-neutral-600">
              Aging
              <select
                value={bucketFilter}
                onChange={(event) => setBucketFilter(event.target.value as BucketFilter)}
                className="rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              >
                <option value="all">All</option>
                {(Object.keys(BUCKET_LABELS) as ReceivableRow["agingBucket"][]).map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {BUCKET_LABELS[bucket]}
                  </option>
                ))}
              </select>
            </label>
            <span className="font-sans text-sm text-neutral-500">Total owed: {formatRwf(totalOwed)}</span>
          </div>
        )}

        {loadError && <LoadErrorBanner message="Couldn't load accounts receivable." onRetry={load} />}

        {!results && !loadError && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {results && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">Nothing outstanding. Every invoice is paid up.</p>
          </div>
        )}

        {results && results.length > 0 && displayedResults.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No invoices in this aging range.</p>
          </div>
        )}

        {results && results.length > 0 && displayedResults.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-surface p-6">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2" aria-sort={ariaSortValue(sortBy, "customerName", sortOrder)}>
                    <button type="button" onClick={() => toggleSort("customerName")} className="cursor-pointer">
                      Customer {sortBy === "customerName" && (sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2">Invoice</th>
                  <th className="py-2" aria-sort={ariaSortValue(sortBy, "dueDate", sortOrder)}>
                    <button type="button" onClick={() => toggleSort("dueDate")} className="cursor-pointer">
                      Due date {sortBy === "dueDate" && (sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2" aria-sort={ariaSortValue(sortBy, "aging", sortOrder)}>
                    <button type="button" onClick={() => toggleSort("aging")} className="cursor-pointer">
                      Aging {sortBy === "aging" && (sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2" aria-sort={ariaSortValue(sortBy, "amountOwed", sortOrder)}>
                    <button type="button" onClick={() => toggleSort("amountOwed")} className="cursor-pointer">
                      Owed {sortBy === "amountOwed" && (sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {displayedResults.map((row) => (
                  <tr key={row.id} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-900">{row.customerName}</td>
                    <td className="py-3">
                      <Link to={`/documents/${row.id}`} className="font-medium text-primary-500 hover:text-primary-700">
                        {row.number ?? "Draft"}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-600">{row.dueDate ?? "No due date"}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${BUCKET_COLORS[row.agingBucket]}`}>
                        {BUCKET_LABELS[row.agingBucket]}
                      </span>
                    </td>
                    <td className="py-3 font-medium text-neutral-900">{formatRwf(row.amountOwed)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openPaymentModal(row)}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1 font-sans text-xs font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
                        >
                          Record payment
                        </button>
                        <button
                          type="button"
                          onClick={() => openWriteOffModal(row)}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1 font-sans text-xs font-medium text-neutral-500 transition-colors hover:border-error hover:text-error"
                        >
                          Write off
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={paymentTarget !== null} onClose={() => setPaymentTarget(null)} title="Record payment">
        {paymentTarget && (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-sm text-neutral-600">
              Against invoice {paymentTarget.number ?? "Draft"} for {paymentTarget.customerName}.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payment-amount" className="font-sans text-sm font-medium text-neutral-800">
                Amount
              </label>
              <input
                id="payment-amount"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payment-method" className="font-sans text-sm font-medium text-neutral-800">
                Method
              </label>
              <select
                id="payment-method"
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              >
                {PAYMENT_METHODS.map((paymentMethod) => (
                  <option key={paymentMethod} value={paymentMethod}>
                    {PAYMENT_METHOD_LABELS[paymentMethod]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payment-date" className="font-sans text-sm font-medium text-neutral-800">
                Date received
              </label>
              <input
                id="payment-date"
                type="date"
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payment-reference" className="font-sans text-sm font-medium text-neutral-800">
                Reference number (optional)
              </label>
              <input
                id="payment-reference"
                type="text"
                placeholder="e.g. MoMo transaction ID"
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payment-payer" className="font-sans text-sm font-medium text-neutral-800">
                Payer name (optional)
              </label>
              <input
                id="payment-payer"
                type="text"
                placeholder="Name on the transaction, if different"
                value={payerName}
                onChange={(event) => setPayerName(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-sm font-medium text-neutral-800">Confirmation photo (optional)</span>
              <div className="flex items-center gap-3">
                {receiptImageUrl && (
                  <span className="font-sans text-sm text-success">Photo attached</span>
                )}
                <label className="cursor-pointer rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50">
                  {isUploadingReceipt ? "Uploading…" : receiptImageUrl ? "Replace photo" : "Attach photo"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingReceipt}
                    onChange={handleReceiptFileChange}
                    className="sr-only"
                    aria-label="Attach confirmation photo"
                  />
                </label>
              </div>
            </div>
            <label className="flex items-center gap-2 font-sans text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={generateReceipt}
                onChange={(event) => setGenerateReceipt(event.target.checked)}
              />
              Generate a receipt for this payment
            </label>

            {paymentError && (
              <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
                {paymentError}
              </div>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPayment}
                onClick={submitPayment}
                className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSavingPayment ? "Saving…" : "Record payment"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={writeOffTarget !== null} onClose={() => setWriteOffTarget(null)} title="Write off invoice">
        {writeOffTarget && (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-sm text-neutral-600">
              This removes invoice {writeOffTarget.number ?? "Draft"} from accounts receivable and records it as a
              loss. You can reactivate it later from the invoice itself.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="write-off-reason" className="font-sans text-sm font-medium text-neutral-800">
                Reason
              </label>
              <textarea
                id="write-off-reason"
                rows={3}
                value={writeOffReason}
                onChange={(event) => setWriteOffReason(event.target.value)}
                className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>

            {writeOffError && (
              <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
                {writeOffError}
              </div>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setWriteOffTarget(null)}
                className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingWriteOff || writeOffReason.trim().length === 0}
                onClick={submitWriteOff}
                className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingWriteOff ? "Saving…" : "Write off"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
