import { useEffect, useState } from "react";
import type { DocumentTemplate } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { FormField } from "../components/FormField";
import { Button } from "../components/Button";
import { apiRequest, ApiError } from "../lib/apiClient";
import { SequenceEditor } from "../components/business/SequenceEditor";
import { BillingSection } from "../components/business/BillingSection";
import { TwoFactorSection } from "../components/business/TwoFactorSection";

interface BusinessProfile {
  name: string;
  tin: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  rraEbmNumber: string | null;
  defaultTemplate: DocumentTemplate;
  primaryColor: string | null;
}

const DEFAULT_BRAND_COLOR = "#27272a";
const COLOR_PRESETS = ["#C2185B", "#2563EB", "#0D9488", "#7C3AED", "#D97706", "#059669", "#27272a"];

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

const IDENTITY_FIELD_IDS: (keyof BusinessProfile)[] = ["name", "tin", "industry"];
const CONTACT_FIELD_IDS: (keyof BusinessProfile)[] = ["phone", "email", "address"];
const TAX_FIELD_IDS: (keyof BusinessProfile)[] = ["rraEbmNumber"];

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
      const payload: Record<string, string | null> = {
        defaultTemplate: profile.defaultTemplate,
        name: profile.name.trim(),
        primaryColor: profile.primaryColor,
      };
      for (const field of TEXT_FIELDS) {
        if (field.id === "name") continue;
        const value = profile[field.id];
        const trimmed = typeof value === "string" ? value.trim() : "";
        payload[field.id] = trimmed.length > 0 ? trimmed : null;
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Business identity</h2>
            <div className="mt-4 flex flex-col gap-5">
              {TEXT_FIELDS.filter((field) => IDENTITY_FIELD_IDS.includes(field.id)).map((field) => (
                <FormField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  type={field.type}
                  value={profile[field.id] ?? ""}
                  onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Contact</h2>
            <div className="mt-4 flex flex-col gap-5">
              {TEXT_FIELDS.filter((field) => CONTACT_FIELD_IDS.includes(field.id)).map((field) => (
                <FormField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  type={field.type}
                  value={profile[field.id] ?? ""}
                  onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Tax and compliance</h2>
            <div className="mt-4 flex flex-col gap-5">
              {TEXT_FIELDS.filter((field) => TAX_FIELD_IDS.includes(field.id)).map((field) => (
                <FormField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  type={field.type}
                  value={profile[field.id] ?? ""}
                  onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Brand color</h2>
            <p className="mt-1 font-sans text-sm text-neutral-500">
              Used for totals, headings, and the sidebar accent template on every document you send.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use ${color}`}
                  onClick={() => setProfile({ ...profile, primaryColor: color })}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    (profile.primaryColor ?? DEFAULT_BRAND_COLOR).toUpperCase() === color.toUpperCase()
                      ? "border-neutral-900"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <label htmlFor="primaryColor" className="flex items-center gap-2">
                <input
                  id="primaryColor"
                  type="color"
                  aria-label="Custom brand color"
                  value={profile.primaryColor ?? DEFAULT_BRAND_COLOR}
                  onChange={(e) => setProfile({ ...profile, primaryColor: e.target.value })}
                  className="h-8 w-8 cursor-pointer rounded-full border border-neutral-200 bg-transparent p-0"
                />
                <span className="font-sans text-sm text-neutral-600">
                  {(profile.primaryColor ?? DEFAULT_BRAND_COLOR).toUpperCase()}
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Document template</h2>
            <div className="mt-4 flex flex-col gap-3">
              {TEMPLATE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`template-${option.value}`}
                  className={`flex items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                    profile.defaultTemplate === option.value
                      ? "border-primary-500 bg-primary-100/40"
                      : "border-neutral-200"
                  }`}
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
          </section>

          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>

        <SequenceEditor />

        <TwoFactorSection />

        <BillingSection />
      </div>
    </AppLayout>
  );
}
