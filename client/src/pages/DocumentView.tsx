import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { apiRequest, API_BASE_URL } from "../lib/apiClient";
import { formatRwf } from "@billa/shared";

interface DocumentLine {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: number;
  lineTotal: number;
}

interface DocumentDetail {
  id: string;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  customer: { name: string };
  lines: DocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

export default function DocumentView() {
  const { id } = useParams();
  const [document, setDocument] = useState<DocumentDetail | null>(null);

  useEffect(() => {
    apiRequest<{ document: DocumentDetail }>(`/documents/${id}`).then((data) => setDocument(data.document));
  }, [id]);

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
            <button
              type="button"
              onClick={() => window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank")}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Download PDF
            </button>
          </div>
        </div>
        <p className="font-sans text-sm text-neutral-600">{document.customer.name}</p>
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
                <td className="py-2">{line.description}</td>
                <td className="py-2">{line.quantity}</td>
                <td className="py-2">{formatRwf(line.unitPrice)}</td>
                <td className="py-2">{formatRwf(line.lineTotal)}</td>
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
    </AppLayout>
  );
}
