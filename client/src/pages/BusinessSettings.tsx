import { useEffect, useState } from "react";
import type { DocumentTemplate } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { FormField } from "../components/FormField";
import { Button } from "../components/Button";
import { apiRequest, ApiError } from "../lib/apiClient";
import { SequenceEditor } from "../components/business/SequenceEditor";
import { BillingSection } from "../components/business/BillingSection";

interface BusinessProfile {
  name: string;
  tin: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  rraEbmNumber: string | null;
  defaultTemplate: DocumentTemplate;
}

const TEMPLATE_OPTIONS: { value: DocumentTemplate; label: string; description: string }[] = [
  { value: "MINIMAL", label: "Minimal", description: "Quiet, a lot of white space." },
  { value: "FORMAL", label: "Formal", description: "The traditional printed-invoice feel." },
  { value: "SIDEBAR_ACCENT", label: "Sidebar accent", description: "A bold colored sidebar carries your branding." },
];

const TEXT_FIELDS: { id: keyof BusinessProfile; label: string; type: "text" | "tel" | "email" }[] = [
  { id: "name", label: "Business name", type: "text" },
  { id: "tin", label: "TIN", type: "text" },
  { id: "industry", label: "Industry", type: "text" },
  { id: "phone", label: "Phone", type: "tel" },
  { id: "email", label: "Business email", type: "email" },
  { id: "address", label: "Address", type: "text" },
  { id: "rraEbmNumber", label: "RRA EBM number", type: "text" },
];

export default function BusinessSettings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<{ business: BusinessProfile }>("/business")
      .then((data) => setProfile(data.business))
      .catch(() => setLoadError(true));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setApiError(null);
    setIsSaving(true);
    try {
      const payload: Record<string, string> = { defaultTemplate: profile.defaultTemplate };
      for (const field of TEXT_FIELDS) {
        const value = profile[field.id];
        if (typeof value === "string" && value.trim().length > 0) {
          payload[field.id] = value.trim();
        }
      }
      await apiRequest("/business", { method: "PATCH", body: payload });
    } catch (err) {
      setApiError(err instanceof ApiError ? "Couldn't save your settings. Try again." : "Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          Couldn't load your business settings. Try again.
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Business settings</h1>

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {TEXT_FIELDS.map((field) => (
            <FormField
              key={field.id}
              id={field.id}
              label={field.label}
              type={field.type}
              value={profile[field.id] ?? ""}
              onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
            />
          ))}

          <div className="flex flex-col gap-3">
            <span className="font-sans text-sm font-medium text-neutral-800">Document template</span>
            {TEMPLATE_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`template-${option.value}`}
                className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3.5"
              >
                <input
                  type="radio"
                  id={`template-${option.value}`}
                  name="defaultTemplate"
                  value={option.value}
                  aria-label={option.label}
                  checked={profile.defaultTemplate === option.value}
                  onChange={() => setProfile({ ...profile, defaultTemplate: option.value })}
                  className="mt-1"
                />
                <span>
                  <span className="block font-sans text-sm font-medium text-neutral-900">{option.label}</span>
                  <span className="block font-sans text-sm text-neutral-500">{option.description}</span>
                </span>
              </label>
            ))}
          </div>

          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>

        <SequenceEditor />

        <BillingSection />
      </div>
    </AppLayout>
  );
}
