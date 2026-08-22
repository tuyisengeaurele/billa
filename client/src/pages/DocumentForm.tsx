import { zodResolver } from "@hookform/resolvers/zod";
import { getDueDateLabel, type DocumentType } from "@billa/shared";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AppLayout } from "../components/AppLayout";
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
});
type DocumentFormInput = z.infer<typeof documentFormSchema>;

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
  type: DocumentType;
}

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
        });
        setConvertedFrom(doc.convertedFrom ?? null);
        setIsLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, [id, isEditing, reset]);

  const totals = calculateLiveTotals(watchedLines ?? []);

  function addLine() {
    append({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 });
  }

  async function saveDraft(data: DocumentFormInput) {
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

  async function handleFinalize() {
    if (!id) return;
    if ((watchedLines ?? []).length === 0) {
      setApiError("Add at least one line before finalizing.");
      return;
    }
    if (
      !window.confirm(
        `Finalize this ${labels.singular}? It will get a permanent number and can no longer be edited.`,
      )
    ) {
      return;
    }
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

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(saveDraft)} className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-sm font-semibold text-neutral-800">Line items</h2>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
              >
                <span aria-hidden="true">+</span> Add line
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="font-sans text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <table className="w-full border-collapse font-sans text-sm">
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
                        <td className="py-2">
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
                        <td className="py-2">
                          <input
                            type="number"
                            step="0.01"
                            aria-label="Quantity"
                            className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5"
                            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            aria-label="Unit price"
                            className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5"
                            {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            aria-label="Tax rate"
                            className="w-16 rounded-lg border border-neutral-200 px-2 py-1.5"
                            {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2 text-neutral-600">{formatRwf(lineTotal)}</td>
                        <td className="py-2">
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
          </div>

          <div className="flex flex-col items-end gap-1 font-sans text-sm text-neutral-600">
            <span>Subtotal: {formatRwf(totals.subtotal)}</span>
            <span>Tax: {formatRwf(totals.taxTotal)}</span>
            <span className="font-semibold text-neutral-900">Total: {formatRwf(totals.total)}</span>
          </div>

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
                className="flex items-center justify-center rounded-lg bg-neutral-900 px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isFinalizing ? "Finalizing…" : "Finalize"}
              </button>
            )}
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
