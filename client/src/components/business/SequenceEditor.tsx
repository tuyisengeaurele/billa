import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DOCUMENT_TYPES, updateSequencesSchema, type DocumentSequenceInput } from "@billa/shared";
import { DOCUMENT_TYPE_LABELS } from "../../lib/documentTypeLabels";
import { apiRequest, ApiError } from "../../lib/apiClient";

const sequencesFormSchema = z.object({ sequences: updateSequencesSchema });
type SequencesFormInput = z.infer<typeof sequencesFormSchema>;

export function SequenceEditor() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { register, handleSubmit, reset } = useForm<SequencesFormInput>({
    resolver: zodResolver(sequencesFormSchema),
    defaultValues: { sequences: [] },
  });

  useEffect(() => {
    apiRequest<{ sequences: DocumentSequenceInput[] }>("/business/sequences")
      .then((data) => {
        reset({ sequences: data.sequences });
        setIsLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, [reset]);

  async function onSubmit(data: SequencesFormInput) {
    setApiError(null);
    setIsSaving(true);
    try {
      await apiRequest("/business/sequences", { method: "PUT", body: data.sequences });
    } catch (err) {
      setApiError(err instanceof ApiError ? "Couldn't save numbering. Try again." : "Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
        Couldn't load document numbering. Try again.
      </div>
    );
  }

  if (!isLoaded) {
    return <p className="font-sans text-sm text-neutral-600">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-sans text-sm font-medium text-neutral-800">Document numbering</span>

      {apiError && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        {DOCUMENT_TYPES.map((type, index) => (
          <div key={type} className="flex items-center gap-3">
            <span className="w-40 font-sans text-sm text-neutral-700">{DOCUMENT_TYPE_LABELS[type].plural}</span>
            <input
              aria-label={`${DOCUMENT_TYPE_LABELS[type].plural} prefix`}
              className="w-24 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm"
              {...register(`sequences.${index}.prefix`)}
            />
            <input
              type="number"
              aria-label={`${DOCUMENT_TYPE_LABELS[type].plural} next number`}
              className="w-24 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm"
              {...register(`sequences.${index}.nextNumber`, { valueAsNumber: true })}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={isSaving}
          className="flex w-auto items-center justify-center self-start rounded-lg bg-primary-500 px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving…" : "Save numbering"}
        </button>
      </form>
    </div>
  );
}
