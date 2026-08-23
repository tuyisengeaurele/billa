import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { useTheme } from "../context/ThemeContext";
import { Sidebar } from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { theme } = useTheme();
  const [billingBanner, setBillingBanner] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
    <div data-theme={theme} className="flex min-h-screen bg-page">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-neutral-200 bg-surface lg:block">
        <Sidebar billingBanner={billingBanner} />
      </aside>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-neutral-200 bg-surface">
            <Sidebar billingBanner={billingBanner} onNavigate={() => setIsMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-surface px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-display text-base font-semibold text-neutral-900">Billa</span>
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
