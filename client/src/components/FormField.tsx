import { forwardRef, useState, type InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-3.22 4.31M6.6 6.6C3.63 8.36 1 12 1 12s4 8 11 8a10.94 10.94 0 0 0 5.1-1.24M9.88 9.88a3 3 0 1 0 4.24 4.24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m1 1 22 22" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, id, type, ...inputProps },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword ? (visible ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-sm font-medium text-neutral-800">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={resolvedType}
          className={`w-full rounded-lg border bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
            isPassword ? "pr-11" : ""
          } ${error ? "border-error" : "border-neutral-200"}`}
          aria-invalid={error ? "true" : "false"}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <p className="font-sans text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
