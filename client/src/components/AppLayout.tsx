import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES } from "@billa/shared";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { BusinessSwitcher } from "./BusinessSwitcher";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { logout } = useAuth();
  const [billingBanner, setBillingBanner] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ activeUntil: string }>("/billing/status")
      .then((data) => {
        const daysLeft = Math.ceil((new Date(data.activeUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) {
          setBillingBanner("Your trial has ended. Subscribe in Settings to keep creating documents.");
        } else if (daysLeft <= 3) {
          setBillingBanner(
            `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Subscribe in Settings to avoid interruption.`,
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <BusinessSwitcher />
        </div>
        <nav className="flex items-center gap-6">
          <Link to="/documents" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            All documents
          </Link>
          {DOCUMENT_TYPES.map((type) => (
            <Link
              key={type}
              to={`/documents?type=${type}`}
              className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              {DOCUMENT_TYPE_LABELS[type].plural}
            </Link>
          ))}
          <Link to="/customers" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Customers
          </Link>
          <Link to="/items" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Items
          </Link>
          <Link to="/settings" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Settings
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => logout()}
          className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Log out
        </button>
      </header>
      {billingBanner && (
        <div className="bg-warning-bg px-6 py-2 font-sans text-sm text-warning" role="status">
          {billingBanner}
        </div>
      )}
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
