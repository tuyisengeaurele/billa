import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { DocumentType } from "@billa/shared";
import { apiRequest, ApiError, API_BASE_URL } from "../lib/apiClient";
import { formatRwf } from "@billa/shared";

interface PublicDocumentLine {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: number;
  lineTotal: number;
}

interface PublicDocumentDetail {
  id: string;
  type: DocumentType;
  number: string;
  lines: PublicDocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  business: { name: string };
  customer: { name: string };
  accepted: boolean;
}

const DOCUMENT_TYPE_DISPLAY: Record<string, string> = {
  INVOICE: "Invoice",
  PROFORMA: "Proforma invoice",
  DELIVERY_NOTE: "Delivery note",
  QUOTE: "Quote",
  RECEIPT: "Receipt",
};

export default function PublicDocumentView() {
  const { token } = useParams();
  const [document, setDocument] = useState<PublicDocumentDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ document: PublicDocumentDetail }>(`/public/documents/${token}`)
      .then((data) => setDocument(data.document))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
  }, [token]);

  async function handleAccept() {
    setIsAccepting(true);
    setAcceptError(null);
    try {
      await apiRequest(`/public/documents/${token}/accept`, { method: "POST" });
      setDocument((current) => (current ? { ...current, accepted: true } : current));
    } catch {
      setAcceptError("Something went wrong accepting this proforma. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="font-sans text-sm text-neutral-600">
          This link isn't valid, or the document is no longer available.
        </p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page px-6 py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-sans text-sm text-neutral-500">{document.business.name}</p>
            <h1 className="font-display text-2xl font-semibold text-neutral-900">
              {DOCUMENT_TYPE_DISPLAY[document.type]} {document.number}
            </h1>
          </div>
          <a
            href={`${API_BASE_URL}/public/documents/${token}/pdf`}
            className="rounded-lg bg-secondary px-4 py-2 font-sans text-sm font-semibold text-secondary-deep transition-all hover:-translate-y-0.5 hover:brightness-95"
          >
            Download PDF
          </a>
        </div>

        <p className="font-sans text-sm text-neutral-600">To: {document.customer.name}</p>

        {document.type === "PROFORMA" && (
          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-surface px-5 py-4">
            {document.accepted ? (
              <p className="font-sans text-sm font-medium text-primary-700">
                This proforma has already been accepted.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <p className="font-sans text-sm font-medium text-neutral-900">Ready to proceed?</p>
                  <p className="font-sans text-sm text-neutral-600">
                    Accepting notifies {document.business.name} to prepare your invoice.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isAccepting}
                  className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
                >
                  {isAccepting ? "Accepting…" : "Accept this proforma"}
                </button>
              </>
            )}
          </div>
        )}

        {acceptError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {acceptError}
          </div>
        )}

        <table className="w-full border-collapse font-sans text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2">Description</th>
              <th className="py-2">Quantity</th>
              <th className="py-2">Unit price</th>
              <th className="py-2">Line total</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line) => (
              <tr key={line.id} className="border-b border-neutral-100">
                <td className="py-2 text-neutral-900">{line.description}</td>
                <td className="py-2 text-neutral-600">{line.quantity}</td>
                <td className="py-2 text-neutral-600">{formatRwf(line.unitPrice)}</td>
                <td className="py-2 text-neutral-600">{formatRwf(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end gap-1 font-sans text-sm text-neutral-600">
          <span>Subtotal: {formatRwf(document.subtotal)}</span>
          <span>Tax: {formatRwf(document.taxTotal)}</span>
          <span className="font-semibold text-neutral-900">Total: {formatRwf(document.total)}</span>
        </div>
      </div>
    </div>
  );
}
