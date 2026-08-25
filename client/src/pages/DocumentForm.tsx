import { zodResolver } from "@hookform/resolvers/zod";
import { getDueDateLabel, RECURRENCE_INTERVALS, type DocumentType, type RecurrenceInterval } from "@billa/shared";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AppLayout } from "../components/AppLayout";
import { Modal } from "../components/Modal";
import { CustomerPicker } from "../components/customers/CustomerPicker";
import { ItemPicker } from "../components/items/ItemPicker";
import { FormField } from "../components/FormField";
import { apiRequest, ApiError, API_BASE_URL } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { formatRwf } from "@billa/shared";

const lineFormSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().trim().min(1, "Enter a description"),
  quantity: z.number({ invalid_type_error: "Enter a quantity" }).positive("Enter a quantity greater than zero"),
  unitPrice: z
    .number({ invalid_type_error: "Enter a price" })
    .int("Enter a whole number of RWF")
    .nonnegative("Price can't be negative"),
  taxRate: z
    .number({ invalid_type_error: "Enter a tax rate" })
    .min(0, "Tax rate can't be negative")
    .max(100, "Tax rate can't exceed 100%"),
});

const documentFormSchema = z.object({
  customerId: z.string().trim().min(1, "Choose a customer"),
  customerName: z.string().trim(),
  issueDate: z.string().trim().min(1, "Choose an issue date"),
  dueDate: z.string().trim(),
  notes: z.string().trim(),
  lines: z.array(lineFormSchema),
  recurrenceEnabled: z.boolean(),
  recurrenceInterval: z.string(),
  recurrenceEndDate: z.string(),
});
type DocumentFormInput = z.infer<typeof documentFormSchema>;

const RECURRENCE_INTERVAL_LABELS: Record<RecurrenceInterval, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

interface DocumentLineResponse {
  itemId: string | null;
  description: string;
  quantity: string | number;
  unitPrice: number;
  taxRate: string | number;
}

interface DocumentResponse {
  id: string;
  customerId: string;
  customer: { name: string };
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: DocumentLineResponse[];
  convertedFrom: { id: string; number: string | null } | null;
  referencedDocument: { id: string; number: string | null } | null;
  type: DocumentType;
  recurrenceInterval: RecurrenceInterval | null;
  recurrenceEndDate: string | null;
}

interface InvoiceOption {
  id: string;
  number: string | null;
  customer: { name: string };
}

const REFERENCEABLE_TYPES: DocumentType[] = ["DELIVERY_NOTE", "RECEIPT"];

function calculateLiveTotals(lines: { quantity?: number; unitPrice?: number; taxRate?: number }[]) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const lineTotal = Math.round((line.quantity || 0) * (line.unitPrice || 0));
    const taxAmount = Math.round(lineTotal * ((line.taxRate || 0) / 100));
    subtotal += lineTotal;
    taxTotal += taxAmount;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

export default function DocumentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<DocumentType>(() => (searchParams.get("type") as DocumentType) ?? "INVOICE");
  const dueDateLabel = getDueDateLabel(type);
  const isEditing = Boolean(id);
  const labels = DOCUMENT_TYPE_LABELS[type];

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!isEditing);
  const [loadError, setLoadError] = useState(false);
  const [convertedFrom, setConvertedFrom] = useState<{ id: string; number: string | null } | null>(null);
  const [referencedDocument, setReferencedDocument] = useState<{ id: string; number: string | null } | null>(null);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [referencedDocumentId, setReferencedDocumentId] = useState("");
  const [isFinalizeConfirmOpen, setIsFinalizeConfirmOpen] = useState(false);
  const canReference = REFERENCEABLE_TYPES.includes(type);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DocumentFormInput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      customerId: "",
      customerName: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      notes: "",
      lines: [],
      recurrenceEnabled: false,
      recurrenceInterval: "MONTHLY",
      recurrenceEndDate: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");

  useEffect(() => {
    if (!isEditing) return;
    apiRequest<{ document: DocumentResponse }>(`/documents/${id}`)
      .then((data) => {
        const doc = data.document;
        setType(doc.type);
        reset({
          customerId: doc.customerId,
          customerName: doc.customer.name,
          issueDate: doc.issueDate.slice(0, 10),
          dueDate: doc.dueDate ? doc.dueDate.slice(0, 10) : "",
          notes: doc.notes ?? "",
          lines: doc.lines.map((line) => ({
            itemId: line.itemId ?? undefined,
            description: line.description,
            quantity: Number(line.quantity),
            unitPrice: line.unitPrice,
            taxRate: Number(line.taxRate),
          })),
          recurrenceEnabled: doc.recurrenceInterval !== null,
          recurrenceInterval: doc.recurrenceInterval ?? "MONTHLY",
          recurrenceEndDate: doc.recurrenceEndDate ? doc.recurrenceEndDate.slice(0, 10) : "",
        });
        setConvertedFrom(doc.convertedFrom ?? null);
        setReferencedDocument(doc.referencedDocument ?? null);
        setReferencedDocumentId(doc.referencedDocument?.id ?? "");
        setIsLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, [id, isEditing, reset]);

  useEffect(() => {
    if (!canReference) return;
    apiRequest<{ results: InvoiceOption[] }>("/documents?type=INVOICE&status=FINALIZED&pageSize=100")
      .then((data) => setInvoiceOptions(data.results))
      .catch(() => setInvoiceOptions([]));
  }, [canReference]);

  async function handleSelectInvoice(invoiceId: string) {
    setReferencedDocumentId(invoiceId);
    if (type !== "DELIVERY_NOTE" || !invoiceId) return;
    try {
      const data = await apiRequest<{ document: DocumentResponse }>(`/documents/${invoiceId}`);
      setValue(
        "lines",
        data.document.lines.map((line) => ({
          itemId: line.itemId ?? undefined,
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: line.unitPrice,
          taxRate: Number(line.taxRate),
        })),
      );
    } catch {
      // Keep the current lines if the invoice's own lines can't be fetched.
    }
  }

  const totals = calculateLiveTotals(watchedLines ?? []);

  function addLine() {
    append({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 });
  }

  async function saveDraft(data: DocumentFormInput) {
    if (type === "RECEIPT" && !referencedDocumentId) {
      setApiError("Choose the invoice this receipt is for.");
      return;
    }
    setApiError(null);
    setIsSaving(true);
    try {
      const payload = {
        type,
        customerId: data.customerId,
        issueDate: data.issueDate,
        dueDate: data.dueDate.trim() || undefined,
        notes: data.notes.trim() || undefined,
        lines: data.lines,
        referencedDocumentId: canReference ? referencedDocumentId || undefined : undefined,
        recurrence: data.recurrenceEnabled
          ? {
              interval: data.recurrenceInterval as RecurrenceInterval,
              endDate: data.recurrenceEndDate.trim() || undefined,
            }
          : null,
      };
      const response = isEditing
        ? await apiRequest<{ document: DocumentResponse }>(`/documents/${id}`, { method: "PATCH", body: payload })
        : await apiRequest<{ document: DocumentResponse }>("/documents", { method: "POST", body: payload });
      navigate(`/documents/${response.document.id}/edit`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setApiError("Your trial has ended. Subscribe in Settings to continue.");
      } else {
        setApiError(
          err instanceof ApiError ? "Couldn't save this document. Try again." : "Something went wrong. Try again.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleFinalize() {
    if (!id) return;
    if ((watchedLines ?? []).length === 0) {
      setApiError("Add at least one line before finalizing.");
      return;
    }
    setIsFinalizeConfirmOpen(true);
  }

  async function confirmFinalize() {
    if (!id) return;
    setIsFinalizeConfirmOpen(false);
    setApiError(null);
    setIsFinalizing(true);
    try {
      await apiRequest(`/documents/${id}/finalize`, { method: "POST" });
      navigate(`/documents/${id}`);
    } catch {
      setApiError("Couldn't finalize this document. Try again.");
    } finally {
      setIsFinalizing(false);
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

  if (!isLoaded) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">
          {isEditing ? `Edit ${labels.singular}` : `New ${labels.singular}`}
        </h1>

        {convertedFrom && (
          <Link
            to={`/documents/${convertedFrom.id}`}
            className="font-sans text-sm text-primary-500 hover:text-primary-700"
          >
            Converted from proforma {convertedFrom.number ?? "Draft"}
          </Link>
        )}

        {referencedDocument && (
          <Link
            to={`/documents/${referencedDocument.id}`}
            className="font-sans text-sm text-primary-500 hover:text-primary-700"
          >
            For invoice {referencedDocument.number ?? "Draft"}
          </Link>
        )}

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(saveDraft)} className="flex flex-col gap-6">
          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Details</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <CustomerPicker
                value={watch("customerName")}
                error={errors.customerId?.message}
                onSelect={(customer) => {
                  setValue("customerId", customer.id);
                  setValue("customerName", customer.name);
                }}
              />
              <FormField
                id="issueDate"
                label="Issue date"
                type="date"
                error={errors.issueDate?.message}
                {...register("issueDate")}
              />
              {dueDateLabel && (
                <FormField
                  id="dueDate"
                  label={dueDateLabel}
                  type="date"
                  error={errors.dueDate?.message}
                  {...register("dueDate")}
                />
              )}
              <FormField id="notes" label="Notes" type="text" error={errors.notes?.message} {...register("notes")} />
              {canReference && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="referencedDocumentId" className="font-sans text-sm font-medium text-neutral-800">
                    Invoice{type === "RECEIPT" ? "" : " (optional)"}
                  </label>
                  <select
                    id="referencedDocumentId"
                    value={referencedDocumentId}
                    onChange={(e) => handleSelectInvoice(e.target.value)}
                    className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">
                      {type === "RECEIPT" ? "Choose an invoice…" : "None — not tied to an invoice"}
                    </option>
                    {invoiceOptions.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.number ?? "Draft"} — {invoice.customer.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-neutral-100 pt-4">
              <label className="flex items-center gap-2 font-sans text-sm font-medium text-neutral-800">
                <input type="checkbox" {...register("recurrenceEnabled")} />
                Make this recurring
              </label>
              {watch("recurrenceEnabled") && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="recurrenceInterval" className="font-sans text-sm font-medium text-neutral-800">
                      Repeats
                    </label>
                    <select
                      id="recurrenceInterval"
                      className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      {...register("recurrenceInterval")}
                    >
                      {RECURRENCE_INTERVALS.map((interval) => (
                        <option key={interval} value={interval}>
                          {RECURRENCE_INTERVAL_LABELS[interval]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <FormField
                    id="recurrenceEndDate"
                    label="Ends on (optional)"
                    type="date"
                    {...register("recurrenceEndDate")}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-neutral-900">Line items</h2>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
              >
                <span aria-hidden="true">+</span> Add line
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="mt-4 font-sans text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <table className="mt-4 w-full border-collapse font-sans text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2">Item</th>
                    <th className="py-2">Quantity</th>
                    <th className="py-2">Unit price</th>
                    <th className="py-2">Tax %</th>
                    <th className="py-2">Line total</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => {
                    const line = watchedLines?.[index];
                    const lineTotal = line ? Math.round((line.quantity || 0) * (line.unitPrice || 0)) : 0;
                    return (
                      <tr key={field.id} className="border-b border-neutral-100">
                        <td className="py-2 align-top">
                          <ItemPicker
                            value={watch(`lines.${index}.description`) ?? ""}
                            error={errors.lines?.[index]?.description?.message}
                            onSelect={(item) => {
                              setValue(`lines.${index}.itemId`, item.id);
                              setValue(`lines.${index}.description`, item.description);
                              setValue(`lines.${index}.unitPrice`, item.unitPrice);
                            }}
                            onDescriptionChange={(text) => {
                              setValue(`lines.${index}.itemId`, undefined);
                              setValue(`lines.${index}.description`, text);
                            }}
                          />
                        </td>
                        <td className="py-2 align-top">
                          <input
                            type="number"
                            step="0.01"
                            aria-label="Quantity"
                            className="w-20 rounded-lg border border-neutral-200 bg-surface px-2 py-1.5 text-neutral-900"
                            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2 align-top">
                          <input
                            type="number"
                            aria-label="Unit price"
                            className="w-24 rounded-lg border border-neutral-200 bg-surface px-2 py-1.5 text-neutral-900"
                            {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2 align-top">
                          <input
                            type="number"
                            aria-label="Tax rate"
                            className="w-16 rounded-lg border border-neutral-200 bg-surface px-2 py-1.5 text-neutral-900"
                            {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2 align-top text-neutral-600">{formatRwf(lineTotal)}</td>
                        <td className="py-2 align-top">
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            aria-label={`Remove line ${index + 1}`}
                            className="text-neutral-400 hover:text-neutral-600"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="mt-4 flex flex-col items-end gap-1 border-t border-neutral-100 pt-4 font-sans text-sm text-neutral-600">
              <span>Subtotal: {formatRwf(totals.subtotal)}</span>
              <span>Tax: {formatRwf(totals.taxTotal)}</span>
              <span className="font-semibold text-neutral-900">Total: {formatRwf(totals.total)}</span>
            </div>
          </section>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center justify-center rounded-lg bg-primary-500 px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Saving…" : "Save draft"}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={() => window.open(`${API_BASE_URL}/documents/${id}/pdf`, "_blank")}
                className="flex items-center justify-center rounded-lg border border-neutral-200 px-6 py-2.5 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Download PDF
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                disabled={isFinalizing}
                onClick={handleFinalize}
                className="flex items-center justify-center rounded-lg bg-[#18181b] px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-[#3f3f46] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isFinalizing ? "Finalizing…" : "Finalize"}
              </button>
            )}
          </div>
        </form>
      </div>

      <Modal
        isOpen={isFinalizeConfirmOpen}
        onClose={() => setIsFinalizeConfirmOpen(false)}
        title={`Finalize ${labels.singular}`}
      >
        <p className="font-sans text-sm text-neutral-600">
          Finalize this {labels.singular}? It will get a permanent number and can no longer be edited.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsFinalizeConfirmOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmFinalize}
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-primary-700"
          >
            Finalize
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
