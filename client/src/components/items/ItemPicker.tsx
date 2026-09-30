import { useEffect, useState } from "react";
import { formatRwf, type ItemInput } from "@billa/shared";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Modal } from "../Modal";
import { ItemForm } from "./ItemForm";

interface ItemResult {
  id: string;
  description: string;
  unitPrice: number;
  unit: string;
  // The API sends Prisma decimals as text ("18.00"), so this may arrive as a string.
  taxRate: number | string;
}

export interface ItemSelection {
  id: string;
  description: string;
  unitPrice: number;
  taxRate: number;
}

interface ItemPickerProps {
  value: string;
  error?: string;
  onSelect: (item: ItemSelection) => void;
  // Called when a line is typed by hand instead of taken from the catalog.
  onDescriptionChange?: (text: string) => void;
}

function toSelection(item: ItemResult): ItemSelection {
  return {
    id: item.id,
    description: item.description,
    unitPrice: item.unitPrice,
    taxRate: Number(item.taxRate),
  };
}

export function ItemPicker({ value, error, onSelect, onDescriptionChange }: ItemPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ItemResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || isAddingNew) return;
    const timeout = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams({ pageSize: "50" });
      if (search.trim()) params.set("search", search.trim());
      apiRequest<{ results: ItemResult[] }>(`/items?${params.toString()}`)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [isOpen, isAddingNew, search]);

  function openModal() {
    setSearch("");
    setIsAddingNew(false);
    setFormError(null);
    setIsOpen(true);
  }

  function selectItem(item: ItemResult) {
    onSelect(toSelection(item));
    setIsOpen(false);
  }

  function useCustomLine() {
    onDescriptionChange?.(search.trim());
    setIsOpen(false);
  }

  async function handleCreateItem(values: ItemInput) {
    setIsSaving(true);
    setFormError(null);
    try {
      const created = await apiRequest<{ item: ItemResult }>("/items", { method: "POST", body: values });
      selectItem(created.item);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setFormError("Your trial has ended. Subscribe in Settings to continue.");
      } else {
        setFormError(err instanceof ApiError ? "Couldn't save that item. Try again." : "Something went wrong. Try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const typed = search.trim();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={openModal}
        className={`flex w-full min-w-[10rem] items-center justify-between gap-2 rounded-lg border bg-surface px-3.5 py-2 text-left font-sans text-sm outline-none transition-colors hover:border-primary-500 ${
          error ? "border-error" : "border-neutral-200"
        } ${value ? "text-neutral-900" : "text-neutral-400"}`}
      >
        <span className="truncate">{value || "Select an item"}</span>
        <span aria-hidden="true" className="text-neutral-400">
          ▾
        </span>
      </button>
      {error && (
        <p className="font-sans text-xs text-error" role="alert">
          {error}
        </p>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={isAddingNew ? "Add item" : "Select an item"}>
        {isAddingNew ? (
          <ItemForm isSubmitting={isSaving} apiError={formError} onSubmit={handleCreateItem} />
        ) : (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              autoFocus
              placeholder="Search items"
              aria-label="Search items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
              >
                <span aria-hidden="true">+</span> Add new item
              </button>
              {onDescriptionChange && typed && (
                <button
                  type="button"
                  onClick={useCustomLine}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
                >
                  Use "{typed}" as a custom line
                </button>
              )}
            </div>
            <div className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-neutral-200">
              {isLoading ? (
                <p className="px-3.5 py-3 font-sans text-sm text-neutral-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3.5 py-3 font-sans text-sm text-neutral-400">No items found.</p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="flex flex-col border-b border-neutral-100 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
                  >
                    <span className="font-sans text-sm text-neutral-900">{item.description}</span>
                    <span className="font-sans text-xs text-neutral-400">
                      {formatRwf(item.unitPrice)} per {item.unit}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
