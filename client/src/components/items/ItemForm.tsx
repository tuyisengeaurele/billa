import { zodResolver } from "@hookform/resolvers/zod";
import { itemSchema, type ItemInput } from "@billa/shared";
import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../Button";
import { FormField } from "../FormField";

const UNIT_OPTIONS = ["piece", "kg", "liter", "hour", "day", "service", "box"] as const;

export interface ItemFormValues {
  description: string;
  unitPrice: number;
  unit: string;
  taxRate: number;
}

interface ItemFormProps {
  initialValues?: ItemFormValues;
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (values: ItemInput) => void;
}

export function ItemForm({ initialValues, isSubmitting, apiError, onSubmit }: ItemFormProps) {
  const initialIsPreset = initialValues
    ? (UNIT_OPTIONS as readonly string[]).includes(initialValues.unit)
    : true;
  const [useCustomUnit, setUseCustomUnit] = useState(!initialIsPreset);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ItemInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      description: initialValues?.description ?? "",
      unitPrice: initialValues?.unitPrice,
      unit: initialValues?.unit ?? UNIT_OPTIONS[0],
      taxRate: initialValues?.taxRate ?? 18,
    },
  });

  function handleUnitSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === "other") {
      setUseCustomUnit(true);
      setValue("unit", "");
    } else {
      setUseCustomUnit(false);
      setValue("unit", value);
    }
  }

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data))} className="flex flex-1 flex-col gap-5" noValidate>
      {apiError && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}
      <FormField
        id="description"
        label="Description"
        type="text"
        error={errors.description?.message}
        {...register("description")}
      />
      <FormField
        id="unitPrice"
        label="Unit price (RWF)"
        type="number"
        error={errors.unitPrice?.message}
        {...register("unitPrice", { valueAsNumber: true })}
      />
      <FormField
        id="taxRate"
        label="Tax rate (%)"
        type="number"
        error={errors.taxRate?.message}
        {...register("taxRate", { valueAsNumber: true })}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="unitSelect" className="font-sans text-sm font-medium text-neutral-800">
          Unit
        </label>
        <select
          id="unitSelect"
          defaultValue={useCustomUnit ? "other" : (initialValues?.unit ?? UNIT_OPTIONS[0])}
          onChange={handleUnitSelectChange}
          className="rounded-lg border border-neutral-200 px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          {UNIT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="other">Other</option>
        </select>
        {useCustomUnit && (
          <FormField id="unit" label="Custom unit" type="text" error={errors.unit?.message} {...register("unit")} />
        )}
      </div>
      <Button type="submit" isLoading={isSubmitting}>
        Save item
      </Button>
    </form>
  );
}
