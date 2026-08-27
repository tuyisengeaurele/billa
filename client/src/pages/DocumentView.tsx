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
  type: DocumentType;
}

interface DocumentDetail {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  publicToken: string;
  customer: { name: string; email: string | null };
  sentAt: string | null;
  lines: DocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  convertedFrom: DocumentLink | null;
  convertedTo: DocumentLink | null;
  referencedDocument: DocumentLink | null;
  declinedAt: string | null;
}

const CONVERTIBLE_TYPES: DocumentType[] = ["PROFORMA", "QUOTE"];

export default function DocumentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isConvertConfirmOpen, setIsConvertConfirmOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

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

  async function handleCopyLink() {
    if (!document) return;
    const url = `${window.location.origin}/view/${document.publicToken}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
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

  async function handleDuplicate() {
    if (!document) return;
    setApiError(null);
    setIsDuplicating(true);
    try {
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/duplicate`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't duplicate this document. Try again." : "Something went wrong. Try again.",
      );
      setIsDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!document) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await apiRequest(`/documents/${document.id}`, { method: "DELETE" });
      navigate("/documents");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError && err.status === 409
          ? "This document was just finalized and can no longer be deleted."
          : "Couldn't delete this document. Try again.",
      );
      setIsDeleting(false);
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
            {CONVERTIBLE_TYPES.includes(document.type) &&
              document.status === "FINALIZED" &&
              (document.convertedTo ? (
                <Link
                  to={`/documents/${document.convertedTo.id}`}
                  className="font-sans text-sm text-primary-500 hover:text-primary-700"
                >
                  Converted to invoice {document.convertedTo.number ?? "Draft"}
                </Link>
              ) : document.declinedAt ? (
                <span className="font-sans text-sm font-medium text-neutral-500">Declined by customer</span>
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
            {document.status === "FINALIZED" && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                {linkCopied ? "Link copied" : "Copy link"}
              </button>
            )}
            <button
              type="button"
              disabled={isDuplicating}
              onClick={handleDuplicate}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isDuplicating ? "Duplicating…" : "Duplicate"}
            </button>
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
            {document.status === "DRAFT" && (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteError(null);
                  setIsDeleteModalOpen(true);
                }}
                className="rounded-lg border border-error px-4 py-2 font-sans text-sm font-semibold text-error transition-colors hover:bg-error-bg"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {deleteError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {deleteError}
          </div>
        )}

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
            Converted from {document.convertedFrom.type === "QUOTE" ? "quote" : "proforma"}{" "}
            {document.convertedFrom.number ?? "Draft"}
          </Link>
        )}
        {document.referencedDocument && (
          <Link
            to={`/documents/${document.referencedDocument.id}`}
            className="-mt-4 font-sans text-sm text-primary-500 hover:text-primary-700"
          >
            For invoice {document.referencedDocument.number ?? "Draft"}
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

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete document"
      >
        <p className="font-sans text-sm text-neutral-600">
          This permanently deletes this draft. This cannot be undone.
        </p>
        <label htmlFor="deleteDocConfirmText" className="mt-4 block font-sans text-sm font-medium text-neutral-800">
          Type <span className="font-semibold">{document.customer.name}</span> to confirm.
        </label>
        <input
          id="deleteDocConfirmText"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleteConfirmText !== document.customer.name || isDeleting}
            onClick={handleDelete}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
