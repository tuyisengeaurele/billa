interface BulkActionBarProps {
  activeCount: number;
  inactiveCount: number;
  noun: string;
  pluralNoun: string;
  onDeactivate: () => void;
  onReactivate: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  activeCount,
  inactiveCount,
  noun,
  pluralNoun,
  onDeactivate,
  onReactivate,
  onClear,
}: BulkActionBarProps) {
  const totalSelected = activeCount + inactiveCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span className="font-sans text-sm font-medium text-neutral-700">
        {totalSelected} {totalSelected === 1 ? noun : pluralNoun} selected
      </span>
      <div className="flex items-center gap-2">
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onDeactivate}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Deactivate ({activeCount})
          </button>
        )}
        {inactiveCount > 0 && (
          <button
            type="button"
            onClick={onReactivate}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Reactivate ({inactiveCount})
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          className="font-sans text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
