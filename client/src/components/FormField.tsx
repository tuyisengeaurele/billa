import { forwardRef, type InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, id, ...inputProps },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={`rounded-lg border px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
          error ? "border-error" : "border-neutral-200"
        }`}
        aria-invalid={error ? "true" : "false"}
        {...inputProps}
      />
      {error && (
        <p className="font-sans text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
