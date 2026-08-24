import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { DocumentType } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { Modal } from "../components/Modal";
import { apiRequest, ApiError, API_BASE_URL } from "../lib/apiClient";
import { formatRwf } from "@billa/shared";

interface DocumentLine {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: number;
  lineTotal: number;
}

interface DocumentLink {
  id: string;
  number: string | null;
}

interface DocumentDetail {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  customer: { name: string; email: string | null };
  sentAt: string | null;
  lines: DocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  convertedFrom: DocumentLink | null;
  convertedTo: DocumentLink | null;
}

export default function DocumentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isConvertConfirmOpen, setIsConvertConfirmOpen] = useState(false);

  useEffect(() => {
    apiRequest<{ document: DocumentDetail }>(`/documents/${id}`)
      .then((data) => setDocument(data.document))
      .catch(() => setLoadError(true));
  }, [id]);

  async function confirmConvert() {
    if (!document) return;
    setIsConvertConfirmOpen(false);
    setApiError(null);
    setIsConverting(true);
    try {
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/convert`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't convert this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsConverting(false);
    }
  }

  async function handleSend() {
    if (!document || !document.customer.email) return;
    setApiError(null);
    setSendMessage(null);
    setIsSending(true);
    try {
      const response = await apiRequest<{ sentAt: string }>(`/documents/${document.id}/send`, { method: "POST" });
      setDocument({ ...document, sentAt: response.sentAt });
      setSendMessage(`Sent to ${document.customer.email}`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't send this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSending(false);
    }
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          Couldn't load this document. Try again.
        </div>
      </AppLayout>
    );
  }

  if (!document) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">{document.number ?? "Draft"}</h1>
          <div className="flex items-center gap-4">
            <span className="font-sans text-sm text-neutral-500">{document.status}</span>
            {document.type === "PROFORMA" &&
              document.status === "FINALIZED" &&
              (document.convertedTo ? (
                <Link
                  to={`/documents/${document.convertedTo.id}`}
                  className="font-sans text-sm text-primary-500 hover:text-primary-700"
                >
                  Converted to invoice {document.convertedTo.number ?? "Draft"}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isConverting}
                  onClick={() => setIsConvertConfirmOpen(true)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isConverting ? "Converting…" : "Convert to invoice"}
                </button>
              ))}
            <button
              type="button"
              onClick={() => window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank")}
              className="rounded-lg bg-secondary px-4 py-2 font-sans text-sm font-semibold text-secondary-deep transition-all hover:-translate-y-0.5 hover:brightness-95"
            >
              Download PDF
            </button>
            {document.status === "FINALIZED" && (
              <button
                type="button"
                disabled={isSending || !document.customer.email}
                onClick={handleSend}
                title={!document.customer.email ? "Add an email to this customer to send it" : undefined}
                className="rounded-lg bg-primary-100 px-4 py-2 font-sans text-sm font-semibold text-primary-700 transition-all hover:-translate-y-0.5 hover:brightness-95 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
              >
                {isSending ? "Sending…" : document.sentAt ? "Resend" : "Send by email"}
              </button>
            )}
          </div>
        </div>

        {sendMessage && (
          <div className="rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success" role="status">
            {sendMessage}
          </div>
        )}
        {document.sentAt && !sendMessage && (
          <p className="font-sans text-xs text-neutral-400">Sent {document.sentAt.slice(0, 10)}</p>
        )}

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <p className="font-sans text-sm text-neutral-600">{document.customer.name}</p>
        {document.type === "INVOICE" && document.convertedFrom && (
          <Link
            to={`/documents/${document.convertedFrom.id}`}
            className="-mt-4 font-sans text-sm text-primary-500 hover:text-primary-700"
          >
            Converted from proforma {document.convertedFrom.number ?? "Draft"}
          </Link>
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

      <Modal
        isOpen={isConvertConfirmOpen}
        onClose={() => setIsConvertConfirmOpen(false)}
        title="Convert to invoice"
      >
        <p className="font-sans text-sm text-neutral-600">Convert this proforma to an invoice? This can't be undone.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsConvertConfirmOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmConvert}
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-primary-700"
          >
            Convert
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
