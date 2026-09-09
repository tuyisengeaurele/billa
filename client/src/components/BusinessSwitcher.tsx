import { useEffect, useRef, useState, type FormEvent } from "react";
import { BUSINESS_LIMIT } from "@billa/shared";
import { apiRequest, ApiError } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";

interface BusinessSummary {
  id: string;
  name: string;
  isOwner: boolean;
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function BusinessRow({ business, isCurrent, onSelect }: { business: BusinessSummary; isCurrent: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full px-3 py-2 text-left font-sans text-sm hover:bg-neutral-50 ${
        isCurrent ? "font-semibold text-primary-700" : "text-neutral-700"
      }`}
    >
      {business.name}
    </button>
  );
}

export function BusinessSwitcher() {
  const { business } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiRequest<{ businesses: BusinessSummary[] }>("/businesses")
      .then((data) => setBusinesses(Array.isArray(data.businesses) ? data.businesses : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

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

  // Only businesses you own count against the 3-business cap - being a member of
  // someone else's doesn't use up any of your own slots.
  const owned = businesses.filter((b) => b.isOwner);
  const shared = businesses.filter((b) => !b.isOwner);
  const showGroupLabels = owned.length > 0 && shared.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface pl-3 pr-2.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        <span className="max-w-[10rem] truncate sm:max-w-[14rem]">{business?.name ?? ""}</span>
        <ChevronIcon isOpen={isOpen} />
      </button>
      {isOpen && (
        <div role="menu" className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-neutral-200 bg-surface py-1 shadow-lg">
          {businesses.length > 1 && (
            <>
              {showGroupLabels && (
                <p className="px-3 pb-1 pt-2 font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Your businesses
                </p>
              )}
              {owned.map((b) => (
                <BusinessRow key={b.id} business={b} isCurrent={b.id === business?.id} onSelect={() => switchTo(b.id)} />
              ))}
              {showGroupLabels && (
                <p className="px-3 pb-1 pt-2 font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Shared with you
                </p>
              )}
              {shared.map((b) => (
                <BusinessRow key={b.id} business={b} isCurrent={b.id === business?.id} onSelect={() => switchTo(b.id)} />
              ))}
              <div className="my-1 border-t border-neutral-100" />
            </>
          )}
          {owned.length < BUSINESS_LIMIT && (
            <>
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
