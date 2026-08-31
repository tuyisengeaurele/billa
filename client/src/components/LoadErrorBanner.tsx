interface LoadErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export function LoadErrorBanner({ message, onRetry }: LoadErrorBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error"
      role="alert"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 font-semibold underline transition-opacity hover:opacity-70"
      >
        Try again
      </button>
    </div>
  );
}
