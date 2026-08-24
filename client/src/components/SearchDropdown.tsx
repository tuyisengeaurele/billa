import { useState } from "react";

export interface SearchDropdownOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchDropdownProps {
  id: string;
  label: string;
  hideLabel?: boolean;
  placeholder: string;
  error?: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchDropdownOption[];
  isLoading: boolean;
  onSelect: (option: SearchDropdownOption) => void;
}

export function SearchDropdown({
  id,
  label,
  hideLabel = false,
  placeholder,
  error,
  query,
  onQueryChange,
  options,
  isLoading,
  onSelect,
}: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "font-sans text-sm font-medium text-neutral-800"}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        autoComplete="off"
        className={`rounded-lg border px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
          error ? "border-error" : "border-neutral-200"
        }`}
      />
      {isOpen && (
        <div className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-surface shadow-lg">
          {isLoading ? (
            <p className="px-3.5 py-2.5 font-sans text-sm text-neutral-400">Searching…</p>
          ) : options.length === 0 ? (
            <p className="px-3.5 py-2.5 font-sans text-sm text-neutral-400">No results</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  setIsOpen(false);
                }}
                className="flex w-full flex-col px-3.5 py-2.5 text-left font-sans text-sm hover:bg-neutral-50"
              >
                <span className="text-neutral-900">{option.label}</span>
                {option.sublabel && <span className="text-xs text-neutral-400">{option.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
      {error && (
        <p className="font-sans text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
