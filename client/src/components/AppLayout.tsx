import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";
import { PageTitleProvider } from "../context/PageTitleContext";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { DocumentTitleSync } from "./DocumentTitleSync";
import { IdleTimeoutModal } from "./IdleTimeoutModal";
import { ImpersonationRequestModal } from "./ImpersonationRequestModal";
import { NotificationBell } from "./NotificationBell";
import { PageTitleBreadcrumb } from "./PageTitleBreadcrumb";
import { ProductTourModal } from "./ProductTourModal";
import { SearchPalette } from "./SearchPalette";
import { SearchPaletteTrigger } from "./SearchPaletteTrigger";
import { Sidebar } from "./Sidebar";
import { SkipToContentLink } from "./SkipToContentLink";
import { UserMenu } from "./UserMenu";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, impersonating, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const [billingBanner, setBillingBanner] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isReturningToAdmin, setIsReturningToAdmin] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function closeSearch() {
    setIsSearchOpen(false);
    searchTriggerRef.current?.focus();
  }

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

  async function handleReturnToAdmin() {
    if (!user) return;
    const targetId = user.id;
    setIsReturningToAdmin(true);
    try {
      await stopImpersonating();
      navigate(`/admin/users/${targetId}`);
    } finally {
      setIsReturningToAdmin(false);
    }
  }

  return (
    <PageTitleProvider>
      <div className="flex min-h-screen flex-col bg-page">
        <SkipToContentLink />
        <DocumentTitleSync />
        <ImpersonationRequestModal />
        <IdleTimeoutModal />
        <ProductTourModal />
        <SearchPalette isOpen={isSearchOpen} onClose={closeSearch} />

        {impersonating && (
          <div
            className="flex items-center justify-center gap-3 bg-warning-bg px-4 py-2 font-sans text-sm font-medium text-warning"
            role="status"
          >
            <span>Viewing as {user?.email}.</span>
            <button
              type="button"
              onClick={handleReturnToAdmin}
              disabled={isReturningToAdmin}
              className="underline hover:no-underline disabled:opacity-50"
            >
              {isReturningToAdmin ? "Returning…" : "Return to admin"}
            </button>
          </div>
        )}

        <AnnouncementBanner />

        <div className="flex flex-1">
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
            <header className="flex items-center gap-3 border-b border-neutral-200 bg-surface px-4 py-3">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open menu"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 lg:hidden"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <PageTitleBreadcrumb />
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <SearchPaletteTrigger ref={searchTriggerRef} onClick={() => setIsSearchOpen(true)} />
                <NotificationBell allHref="/notifications" />
                <UserMenu profileHref="/profile" logoutConfirmMessage="Log out of Billa?" />
              </div>
            </header>
            <main id="main-content" tabIndex={-1} className="flex-1 px-6 py-8 outline-none">
              {children}
            </main>
          </div>
        </div>
      </div>
    </PageTitleProvider>
  );
}
