interface AdminPaginationProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

const BUTTON_CLASSES =
  "rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

export function AdminPagination({ page, totalPages, onPrevious, onNext }: AdminPaginationProps) {
  return (
    <div className="mt-4 flex items-center justify-between font-sans text-sm text-neutral-600">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={onPrevious} className={BUTTON_CLASSES}>
          Previous
        </button>
        <button type="button" disabled={page >= totalPages} onClick={onNext} className={BUTTON_CLASSES}>
          Next
        </button>
      </div>
    </div>
  );
}
