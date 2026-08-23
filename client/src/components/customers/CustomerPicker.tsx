import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Modal } from "../Modal";
import { CustomerForm, type CustomerSubmitValues } from "./CustomerForm";

interface CustomerResult {
  id: string;
  name: string;
  phone: string | null;
}

export interface CustomerSelection {
  id: string;
  name: string;
}

interface CustomerPickerProps {
  value: string;
  error?: string;
  onSelect: (customer: CustomerSelection) => void;
}

export function CustomerPicker({ value, error, onSelect }: CustomerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || isAddingNew) return;
    const timeout = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams({ pageSize: "50" });
      if (search.trim()) params.set("search", search.trim());
      apiRequest<{ results: CustomerResult[] }>(`/customers?${params.toString()}`)
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

  function selectCustomer(customer: CustomerResult) {
    onSelect({ id: customer.id, name: customer.name });
    setIsOpen(false);
  }

  async function handleCreateCustomer(values: CustomerSubmitValues) {
    setIsSaving(true);
    setFormError(null);
    try {
      const created = await apiRequest<{ customer: CustomerResult }>("/customers", {
        method: "POST",
        body: values,
      });
      selectCustomer(created.customer);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setFormError("Your trial has ended. Subscribe in Settings to continue.");
      } else {
        setFormError(err instanceof ApiError ? "Couldn't save that customer. Try again." : "Something went wrong. Try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-sm font-medium text-neutral-800">Customer</span>
      <button
        type="button"
        onClick={openModal}
        className={`flex items-center justify-between rounded-lg border bg-surface px-3.5 py-2.5 font-sans text-sm outline-none transition-colors hover:border-primary-500 ${
          error ? "border-error" : "border-neutral-200"
        } ${value ? "text-neutral-900" : "text-neutral-400"}`}
      >
        {value || "Select a customer"}
        <span aria-hidden="true" className="text-neutral-400">
          ▾
        </span>
      </button>
      {error && (
        <p className="font-sans text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={isAddingNew ? "Add customer" : "Select a customer"}>
        {isAddingNew ? (
          <CustomerForm isSubmitting={isSaving} apiError={formError} onSubmit={handleCreateCustomer} />
        ) : (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              autoFocus
              placeholder="Search customers"
              aria-label="Search customers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="button"
              onClick={() => setIsAddingNew(true)}
              className="flex items-center gap-1.5 self-start rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
            >
              <span aria-hidden="true">+</span> Add new customer
            </button>
            <div className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-neutral-200">
              {isLoading ? (
                <p className="px-3.5 py-3 font-sans text-sm text-neutral-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3.5 py-3 font-sans text-sm text-neutral-400">No customers found.</p>
              ) : (
                results.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="flex flex-col border-b border-neutral-100 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
                  >
                    <span className="font-sans text-sm text-neutral-900">{customer.name}</span>
                    {customer.phone && <span className="font-sans text-xs text-neutral-400">{customer.phone}</span>}
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
