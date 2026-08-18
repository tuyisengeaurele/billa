import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { apiRequest, ApiError } from "../../lib/apiClient";

const detailsFormSchema = z.object({
  tin: z.string().trim(),
  industry: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid business email")]),
  address: z.string().trim(),
  rraEbmNumber: z.string().trim(),
});
type DetailsFormInput = z.infer<typeof detailsFormSchema>;

const FIELDS: { id: keyof DetailsFormInput; label: string; type: "text" | "tel" | "email" }[] = [
  { id: "tin", label: "TIN", type: "text" },
  { id: "industry", label: "Industry", type: "text" },
  { id: "phone", label: "Phone", type: "tel" },
  { id: "email", label: "Business email", type: "email" },
  { id: "address", label: "Address", type: "text" },
  { id: "rraEbmNumber", label: "RRA EBM number", type: "text" },
];

interface DetailsStepProps {
  onComplete: () => void;
}

export function DetailsStep({ onComplete }: DetailsStepProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DetailsFormInput>({ resolver: zodResolver(detailsFormSchema) });

  async function onSubmit(data: DetailsFormInput) {
    setApiError(null);
    const payload: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = data[field.id].trim();
      if (value.length > 0) {
        payload[field.id] = value;
      }
    }

    if (Object.keys(payload).length === 0) {
      onComplete();
      return;
    }

    try {
      await apiRequest("/business", { method: "PATCH", body: payload });
      onComplete();
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError("Couldn't save those details. Try again.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Tell us about your business</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        All optional — fill in what you have, skip what you don't.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        {FIELDS.map((field) => (
          <FormField
            key={field.id}
            id={field.id}
            label={field.label}
            type={field.type}
            error={errors[field.id]?.message}
            {...register(field.id)}
          />
        ))}
        <Button type="submit" isLoading={isSubmitting}>
          Continue
        </Button>
        <button
          type="button"
          onClick={onComplete}
          className="self-center font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
        >
          Skip this step
        </button>
      </form>
    </div>
  );
}
