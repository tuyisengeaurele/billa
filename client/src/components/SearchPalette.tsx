import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { DocumentType } from "@billa/shared";
import { apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface SearchResult {
  type: "customer" | "item" | "document";
  id: string;
  label: string;
  sublabel: string;
  documentType?: DocumentType;
  href: string;
}

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTION_ORDER = ["customer", "item", "document"] as const;
const SECTION_LABELS: Record<SearchResult["type"], string> = {
  customer: "Customers",
  item: "Items",
  document: "Documents",
};

function resultSublabel(result: SearchResult): string {
  if (result.type === "document" && result.documentType) {
    return `${DOCUMENT_TYPE_LABELS[result.documentType].singular} · ${result.sublabel}`;
  }
  return result.sublabel;
}

export function SearchPalette({ isOpen, onClose }: SearchPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timeout = setTimeout(() => {
      apiRequest<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setSelectedIndex(0);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, isOpen]);

  function goToResult(result: SearchResult) {
    navigate(result.href);
    onClose();
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[selectedIndex];
      if (selected) goToResult(selected);
    }
  }

  const trimmedQuery = query.trim();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-24 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className="shrink-0 text-neutral-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customers, items, and documents"
                aria-label="Search customers, items, and documents"
                className="flex-1 bg-transparent font-sans text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </div>

            <div className="overflow-y-auto" role="listbox" aria-label="Search results">
              {trimmedQuery.length < 2 ? (
                <p className="px-4 py-8 text-center font-sans text-sm text-neutral-500">
                  Search customers, items, and documents.
                </p>
              ) : isLoading ? (
                <p className="px-4 py-8 text-center font-sans text-sm text-neutral-500">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-8 text-center font-sans text-sm text-neutral-500">No results for "{trimmedQuery}"</p>
              ) : (
                SECTION_ORDER.map((type) => {
                  const section = results.filter((r) => r.type === type);
                  if (section.length === 0) return null;
                  return (
                    <div key={type} className="py-2">
                      <p className="px-4 py-1 font-sans text-xs font-medium uppercase tracking-wide text-neutral-400">
                        {SECTION_LABELS[type]}
                      </p>
                      {section.map((result) => {
                        const index = results.indexOf(result);
                        const isSelected = index === selectedIndex;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => goToResult(result)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left font-sans text-sm transition-colors ${
                              isSelected ? "bg-primary-100 text-primary-700" : "text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            <span className="font-medium">{result.label}</span>
                            <span className="text-xs text-neutral-500">{resultSublabel(result)}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
