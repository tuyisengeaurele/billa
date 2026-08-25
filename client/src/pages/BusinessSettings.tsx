import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocumentTemplate } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { FormField } from "../components/FormField";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { LogoStep } from "../components/onboarding/LogoStep";
import { API_BASE_URL, apiRequest, ApiError } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";
import { SequenceEditor } from "../components/business/SequenceEditor";
import { BillingSection } from "../components/business/BillingSection";
import { TwoFactorSection } from "../components/business/TwoFactorSection";
import { TeamSection } from "../components/business/TeamSection";

interface BusinessProfile {
  ownerId: string;
  name: string;
  tin: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  rraEbmNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  defaultTemplate: DocumentTemplate;
  primaryColor: string | null;
  logoUrl: string | null;
}

const DEFAULT_BRAND_COLOR = "#27272a";
const COLOR_PRESETS = ["#C2185B", "#2563EB", "#0D9488", "#7C3AED", "#D97706", "#059669", "#27272a"];

const TEMPLATE_OPTIONS: { value: DocumentTemplate; label: string; description: string }[] = [
  { value: "MINIMAL", label: "Minimal", description: "Quiet, a lot of white space." },
  { value: "PREMIUM", label: "Premium", description: "A polished, full-color invoice layout with payment details." },
];

const TEXT_FIELDS: { id: keyof BusinessProfile; label: string; type: "text" | "tel" | "email" }[] = [
  { id: "tin", label: "TIN", type: "text" },
  { id: "industry", label: "Industry", type: "text" },
  { id: "phone", label: "Phone", type: "tel" },
  { id: "email", label: "Business email", type: "email" },
  { id: "address", label: "Address", type: "text" },
  { id: "rraEbmNumber", label: "RRA EBM number", type: "text" },
  { id: "bankName", label: "Bank name", type: "text" },
  { id: "bankAccountNumber", label: "Bank account number", type: "text" },
  { id: "signatoryName", label: "Signatory name", type: "text" },
  { id: "signatoryTitle", label: "Signatory title", type: "text" },
];

const IDENTITY_FIELD_IDS: (keyof BusinessProfile)[] = ["tin", "industry"];
const CONTACT_FIELD_IDS: (keyof BusinessProfile)[] = ["phone", "email", "address"];
const TAX_FIELD_IDS: (keyof BusinessProfile)[] = ["rraEbmNumber"];
const PAYMENT_FIELD_IDS: (keyof BusinessProfile)[] = [
  "bankName",
  "bankAccountNumber",
  "signatoryName",
  "signatoryTitle",
];

export default function BusinessSettings() {
  const { user, isLoading: isAuthLoading, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isEditingLogo, setIsEditingLogo] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState("");
  const [renameConfirmText, setRenameConfirmText] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  function loadProfile() {
    return apiRequest<{ business: BusinessProfile }>("/business")
      .then((data) => setProfile(data.business))
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadProfile();
  }, []);

  function handleLogoComplete() {
    setIsEditingLogo(false);
    loadProfile();
  }

  function openRenameModal() {
    if (!profile) return;
    setNewBusinessName(profile.name);
    setRenameConfirmText("");
    setRenameError(null);
    setIsRenameModalOpen(true);
  }

  async function handleRenameBusiness() {
    if (!profile) return;
    const trimmed = newBusinessName.trim();
    setRenameError(null);
    setIsRenaming(true);
    try {
      await apiRequest("/business", { method: "PATCH", body: { name: trimmed } });
      setProfile({ ...profile, name: trimmed });
      setIsRenameModalOpen(false);
    } catch {
      setRenameError("Couldn't rename your business. Try again.");
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      navigate("/login");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError && err.status === 409
          ? "Can't delete an account with an admin action history."
          : "Couldn't delete your account. Try again.",
      );
      setIsDeletingAccount(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setApiError(null);
    setIsSaving(true);
    try {
      const payload: Record<string, string | null> = {
        defaultTemplate: profile.defaultTemplate,
        primaryColor: profile.primaryColor,
      };
      for (const field of TEXT_FIELDS) {
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

  if (!profile || isAuthLoading) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  const isOwner = profile.ownerId === user?.id;

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Business settings</h1>

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        {!isOwner && (
          <div className="rounded-lg bg-neutral-100 px-4 py-3 font-sans text-sm text-neutral-600">
            Only the business owner can change these settings.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Business identity</h2>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3">
              <div>
                <p className="font-sans text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Business name
                </p>
                <p className="mt-0.5 font-sans text-sm text-neutral-900">{profile.name}</p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={openRenameModal}
                  className="shrink-0 rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Rename
                </button>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-5">
              {TEXT_FIELDS.filter((field) => IDENTITY_FIELD_IDS.includes(field.id)).map((field) => (
                <FormField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  type={field.type}
                  disabled={!isOwner}
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
                  disabled={!isOwner}
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
                  disabled={!isOwner}
                  value={profile[field.id] ?? ""}
                  onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Payment details</h2>
            <p className="mt-1 font-sans text-sm text-neutral-500">
              Shown as payment instructions and a signature block on your documents.
            </p>
            <div className="mt-4 flex flex-col gap-5">
              {TEXT_FIELDS.filter((field) => PAYMENT_FIELD_IDS.includes(field.id)).map((field) => (
                <FormField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  type={field.type}
                  disabled={!isOwner}
                  value={profile[field.id] ?? ""}
                  onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Logo</h2>
            {!isOwner ? (
              <p className="mt-2 font-sans text-sm text-neutral-600">Only the business owner can change the logo.</p>
            ) : isEditingLogo ? (
              <div className="mt-4">
                <LogoStep onComplete={handleLogoComplete} />
              </div>
            ) : profile.logoUrl ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-2">
                  <img
                    src={`${API_BASE_URL}${profile.logoUrl}`}
                    alt="Your business logo"
                    className="h-full w-full object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingLogo(true)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Replace logo
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-start gap-3">
                <p className="font-sans text-sm text-neutral-600">No logo yet.</p>
                <button
                  type="button"
                  onClick={() => setIsEditingLogo(true)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Add a logo
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-surface p-6">
            <h2 className="font-display text-base font-semibold text-neutral-900">Brand color</h2>
            <p className="mt-1 font-sans text-sm text-neutral-500">
              Used for document titles, table headers, and totals on every document you send.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={!isOwner}
                  aria-label={`Use ${color}`}
                  onClick={() => setProfile({ ...profile, primaryColor: color })}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:hover:scale-100 ${
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
                  disabled={!isOwner}
                  aria-label="Custom brand color"
                  value={profile.primaryColor ?? DEFAULT_BRAND_COLOR}
                  onChange={(e) => setProfile({ ...profile, primaryColor: e.target.value })}
                  className="h-8 w-8 cursor-pointer rounded-full border border-neutral-200 bg-transparent p-0 disabled:cursor-not-allowed"
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
                    disabled={!isOwner}
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

          {isOwner && (
            <Button type="submit" isLoading={isSaving}>
              Save
            </Button>
          )}
        </form>

        <SequenceEditor />

        <TeamSection />

        <TwoFactorSection />

        <BillingSection />

        <section className="rounded-xl border border-error/30 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Danger zone</h2>
          <p className="mt-1 font-sans text-sm text-neutral-600">
            {isOwner
              ? `Permanently delete your account and ${profile.name}, including all documents, customers, and items. This cannot be undone.`
              : "Permanently delete your account. You'll be removed from this business. This cannot be undone."}
          </p>
          {deleteError && (
            <div className="mt-3 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {deleteError}
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="mt-4 rounded-lg border border-error px-4 py-2 font-sans text-sm font-semibold text-error transition-colors hover:bg-error-bg"
          >
            Delete my account
          </button>
        </section>
      </div>

      <Modal isOpen={isRenameModalOpen} onClose={() => setIsRenameModalOpen(false)} title="Rename business">
        {renameError && (
          <div className="mb-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {renameError}
          </div>
        )}
        <label htmlFor="newBusinessName" className="block font-sans text-sm font-medium text-neutral-800">
          New business name
        </label>
        <input
          id="newBusinessName"
          value={newBusinessName}
          onChange={(e) => setNewBusinessName(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <label htmlFor="renameConfirmText" className="mt-4 block font-sans text-sm font-medium text-neutral-800">
          Type <span className="font-semibold">{profile.name}</span> to confirm.
        </label>
        <input
          id="renameConfirmText"
          value={renameConfirmText}
          onChange={(e) => setRenameConfirmText(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsRenameModalOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={renameConfirmText !== profile.name || !newBusinessName.trim() || isRenaming}
            onClick={handleRenameBusiness}
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRenaming ? "Renaming…" : "Rename"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteConfirmText("");
        }}
        title="Delete account"
      >
        <p className="font-sans text-sm text-neutral-600">
          This permanently deletes your account{isOwner ? ` and ${profile.name}` : ""}. This cannot be undone.
        </p>
        <label htmlFor="deleteAccountConfirmText" className="mt-4 block font-sans text-sm font-medium text-neutral-800">
          Type <span className="font-semibold">{user?.email}</span> to confirm.
        </label>
        <input
          id="deleteAccountConfirmText"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeleteConfirmText("");
            }}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleteConfirmText !== user?.email || isDeletingAccount}
            onClick={handleDeleteAccount}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeletingAccount ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
