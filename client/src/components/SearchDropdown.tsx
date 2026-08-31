import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

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
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = `${id}-listbox`;

  // A fresh set of results should always highlight from the top.
  useEffect(() => {
    setActiveIndex(0);
  }, [options]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (options.length === 0 ? 0 : (current + 1) % options.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (options.length === 0 ? 0 : (current - 1 + options.length) % options.length));
    } else if (event.key === "Enter") {
      if (!isOpen || options.length === 0) return;
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        onSelect(option);
        setIsOpen(false);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "font-sans text-sm font-medium text-neutral-800"}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && options[activeIndex] ? `${listboxId}-${options[activeIndex].id}` : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className={`rounded-lg border px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
          error ? "border-error" : "border-neutral-200"
        }`}
      />
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-surface shadow-lg"
        >
          {isLoading ? (
            <p className="px-3.5 py-2.5 font-sans text-sm text-neutral-400">Searching…</p>
          ) : options.length === 0 ? (
            <p className="px-3.5 py-2.5 font-sans text-sm text-neutral-400">No results</p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.id}
                id={`${listboxId}-${option.id}`}
                role="option"
                aria-selected={index === activeIndex}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onSelect(option);
                  setIsOpen(false);
                }}
                className={`flex w-full flex-col px-3.5 py-2.5 text-left font-sans text-sm ${
                  index === activeIndex ? "bg-neutral-50" : "hover:bg-neutral-50"
                }`}
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
