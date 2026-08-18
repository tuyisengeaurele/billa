import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../Button";
import { FormField } from "../FormField";

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a customer name"),
  tin: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]),
});
type CustomerFormInput = z.infer<typeof customerFormSchema>;

export interface CustomerFormValues {
  name: string;
  tin?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface CustomerSubmitValues {
  name: string;
  tin?: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface CustomerFormProps {
  initialValues?: CustomerFormValues;
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (values: CustomerSubmitValues) => void;
}

export function CustomerForm({ initialValues, isSubmitting, apiError, onSubmit }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormInput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      tin: initialValues?.tin ?? "",
      address: initialValues?.address ?? "",
      phone: initialValues?.phone ?? "",
      email: initialValues?.email ?? "",
    },
  });

  function submit(data: CustomerFormInput) {
    const payload: CustomerSubmitValues = { name: data.name.trim() };
    if (data.tin.trim()) payload.tin = data.tin.trim();
    if (data.address.trim()) payload.address = data.address.trim();
    if (data.phone.trim()) payload.phone = data.phone.trim();
    if (data.email.trim()) payload.email = data.email.trim();
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col gap-5" noValidate>
      {apiError && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}
      <FormField id="name" label="Name" type="text" error={errors.name?.message} {...register("name")} />
      <FormField id="tin" label="TIN" type="text" error={errors.tin?.message} {...register("tin")} />
      <FormField id="address" label="Address" type="text" error={errors.address?.message} {...register("address")} />
      <FormField id="phone" label="Phone" type="tel" error={errors.phone?.message} {...register("phone")} />
      <FormField id="email" label="Email" type="email" error={errors.email?.message} {...register("email")} />
      <Button type="submit" isLoading={isSubmitting}>
        Save customer
      </Button>
    </form>
  );
}
