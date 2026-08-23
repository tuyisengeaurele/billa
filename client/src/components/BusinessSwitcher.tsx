import { useEffect, useState, type FormEvent } from "react";
import { BUSINESS_LIMIT } from "@billa/shared";
import { apiRequest, ApiError } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";

interface BusinessSummary {
  id: string;
  name: string;
}

export function BusinessSwitcher() {
  const { business } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ businesses: BusinessSummary[] }>("/businesses")
      .then((data) => setBusinesses(Array.isArray(data.businesses) ? data.businesses : []))
      .catch(() => {});
  }, []);

  async function switchTo(id: string) {
    if (id === business?.id) {
      setIsOpen(false);
      return;
    }
    await apiRequest("/auth/switch-business", { method: "POST", body: { businessId: id } });
    window.location.href = "/dashboard";
  }

  async function addBusiness(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await apiRequest("/businesses", { method: "POST", body: { name: newName } });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "You've reached the limit of 3 businesses."
          : "Couldn't create that business. Try again.",
      );
      setIsSaving(false);
    }
  }

  const label = `Billa · ${business?.name ?? ""}`;

  if (businesses.length <= 1) {
    return <span className="font-display text-lg font-semibold text-neutral-900">{label}</span>;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="font-display text-lg font-semibold text-neutral-900"
      >
        {label} {isOpen ? "▲" : "▼"}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-neutral-200 bg-surface py-1 shadow-lg">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => switchTo(b.id)}
              className={`block w-full px-3 py-2 text-left font-sans text-sm hover:bg-neutral-50 ${
                b.id === business?.id ? "font-semibold text-primary-700" : "text-neutral-700"
              }`}
            >
              {b.name}
            </button>
          ))}
          {businesses.length < BUSINESS_LIMIT && (
            <>
              <div className="my-1 border-t border-neutral-100" />
              {isAdding ? (
                <form onSubmit={addBusiness} className="flex flex-col gap-2 px-3 py-2">
                  {error && <p className="font-sans text-xs text-error">{error}</p>}
                  <label htmlFor="new-business-name" className="sr-only">
                    New business name
                  </label>
                  <input
                    id="new-business-name"
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className="rounded border border-neutral-200 px-2 py-1 font-sans text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded bg-primary-500 px-2 py-1 font-sans text-sm text-white disabled:opacity-70"
                  >
                    {isSaving ? "Adding…" : "Add business"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="block w-full px-3 py-2 text-left font-sans text-sm text-primary-600 hover:bg-neutral-50"
                >
                  + Add another business
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
