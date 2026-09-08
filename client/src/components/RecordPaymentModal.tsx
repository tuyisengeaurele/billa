import { useEffect, useState } from "react";
import { PAYMENT_METHODS, type PaymentMethod } from "@billa/shared";
import { Modal } from "./Modal";
import { apiRequest, ApiError } from "../lib/apiClient";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

interface RecordPaymentModalProps {
  isOpen: boolean;
  documentId: string;
  documentNumber: string | null;
  customerName: string;
  amountOwed: number;
  onClose: () => void;
  onRecorded: () => void;
}

export function RecordPaymentModal({
  isOpen,
  documentId,
  documentNumber,
  customerName,
  amountOwed,
  onClose,
  onRecorded,
}: RecordPaymentModalProps) {
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

  useEffect(() => {
    if (!isOpen) return;
    setAmount(String(amountOwed));
    setMethod("CASH");
    setPaidOn(new Date().toISOString().slice(0, 10));
    setGenerateReceipt(true);
    setReferenceNumber("");
    setPayerName("");
    setReceiptImageUrl(null);
    setPaymentError(null);
  }, [isOpen, amountOwed]);

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
    setIsSavingPayment(true);
    setPaymentError(null);
    try {
      await apiRequest(`/documents/${documentId}/payments`, {
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
      onRecorded();
    } catch (err) {
      setPaymentError(
        err instanceof ApiError ? "Couldn't record this payment. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSavingPayment(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record payment">
      <div className="flex flex-col gap-4">
        <p className="font-sans text-sm text-neutral-600">
          Against invoice {documentNumber ?? "Draft"} for {customerName}.
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
            {receiptImageUrl && <span className="font-sans text-sm text-success">Photo attached</span>}
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
          <input type="checkbox" checked={generateReceipt} onChange={(event) => setGenerateReceipt(event.target.checked)} />
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
            onClick={onClose}
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
    </Modal>
  );
}
