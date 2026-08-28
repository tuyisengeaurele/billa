import { forwardRef } from "react";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? navigator.userAgent;
  return /Mac|iPhone|iPad/.test(platform);
}

interface SearchPaletteTriggerProps {
  onClick: () => void;
}

export const SearchPaletteTrigger = forwardRef<HTMLButtonElement, SearchPaletteTriggerProps>(
  function SearchPaletteTrigger({ onClick }, ref) {
    const shortcutLabel = isMacPlatform() ? "⌘K" : "Ctrl+K";

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label="Search customers, items, and documents"
        className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-xs text-neutral-400 sm:inline-block">
          {shortcutLabel}
        </kbd>
      </button>
    );
  },
);
