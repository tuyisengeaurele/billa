import type { ReactNode } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { IdleTimeoutModal } from "../IdleTimeoutModal";
import { NotificationBell } from "../NotificationBell";
import { PageTitleBreadcrumb } from "../PageTitleBreadcrumb";
import { UserMenu } from "../UserMenu";
import { PageTitleProvider } from "../../context/PageTitleContext";
import { AdminSidebar } from "./AdminSidebar";
import { MenuIcon } from "./icons";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <PageTitleProvider>
      <div className="flex min-h-screen bg-page">
        <IdleTimeoutModal />

        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-neutral-200 bg-surface lg:block">
          <AdminSidebar />
        </aside>

        {isMobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setIsMobileNavOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-neutral-200 bg-surface">
              <AdminSidebar onNavigate={() => setIsMobileNavOpen(false)} />
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
              <MenuIcon />
            </button>
            <PageTitleBreadcrumb />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <NotificationBell allHref="/admin/notifications" />
              <UserMenu profileHref="/admin/profile" logoutConfirmMessage="Log out of the admin dashboard?" />
            </div>
          </header>
          <motion.main
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mx-auto w-full max-w-5xl flex-1 px-6 py-8"
          >
            {children}
          </motion.main>
        </div>
      </div>
    </PageTitleProvider>
  );
}
