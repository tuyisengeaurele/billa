import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatRwf, type DocumentType, type InvoicePaymentStatus } from "@billa/shared";
import { apiRequest, ApiError, API_BASE_URL } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS } from "../lib/paymentStatusColors";

interface PortalDocument {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  total: number;
  amountPaid: number;
  paymentStatus: InvoicePaymentStatus | null;
  publicToken: string;
}

export default function PublicCustomerPortal() {
  const { token } = useParams();
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PortalDocument[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiRequest<{ customer: { name: string }; documents: PortalDocument[] }>(`/public/customers/${token}`)
      .then((data) => {
        setCustomerName(data.customer.name);
        setDocuments(data.documents);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [token]);

  if (notFound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="font-sans text-sm text-neutral-600">This link isn't valid.</p>
      </div>
    );
  }

  if (!documents) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page px-6 py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">{customerName}</h1>

        {documents.length === 0 ? (
          <p className="font-sans text-sm text-neutral-600">No documents yet.</p>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-surface p-6">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse font-sans text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Number</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-600">{doc.issueDate.slice(0, 10)}</td>
                    <td className="py-3 text-neutral-900">{DOCUMENT_TYPE_LABELS[doc.type].singular}</td>
                    <td className="py-3 text-neutral-900">{doc.number ?? "Draft"}</td>
                    <td className="py-3 text-neutral-600">{formatRwf(doc.total)}</td>
                    <td className="py-3">
                      {doc.paymentStatus && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${PAYMENT_STATUS_COLORS[doc.paymentStatus]}`}
                        >
                          {PAYMENT_STATUS_LABELS[doc.paymentStatus]}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <a
                        href={`${API_BASE_URL}/public/documents/${doc.publicToken}/pdf`}
                        className="font-medium text-primary-500 hover:text-primary-700"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
