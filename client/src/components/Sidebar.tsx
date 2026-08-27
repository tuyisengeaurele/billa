import type { ReactNode } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { DOCUMENT_TYPES } from "@billa/shared";
import { useAuth } from "../context/AuthContext";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { DOCUMENT_TYPE_COLORS } from "../lib/documentTypeColors";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { Modal } from "./Modal";
import { ThemeToggle } from "./ThemeToggle";

interface SidebarProps {
  billingBanner: string | null;
  onNavigate?: () => void;
}

function isLinkActive(pathname: string, search: string, to: string): boolean {
  const [toPath, toQuery] = to.split("?");
  if (pathname !== toPath) return false;
  if (!toQuery) return !search;
  const toType = new URLSearchParams(toQuery).get("type");
  const currentType = new URLSearchParams(search).get("type");
  return toType === currentType;
}

function SidebarLink({
  to,
  children,
  isActive,
  onNavigate,
  dotColor,
  icon,
}: {
  to: string;
  children: ReactNode;
  isActive: boolean;
  onNavigate?: () => void;
  dotColor?: string;
  icon?: ReactNode;
}) {
  return (
    <Link to={to} onClick={onNavigate} className="relative block rounded-lg px-3 py-2 font-sans text-sm font-medium">
      {isActive && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-primary-100"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <span
        className={`relative z-10 flex items-center gap-2 transition-colors ${
          isActive ? "text-primary-700" : "text-neutral-600 hover:text-neutral-900"
        }`}
      >
        {icon}
        {dotColor && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />}
        {children}
      </span>
    </Link>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function RevenueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}

function ReceivablesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 3" />
    </svg>
  );
}

function DocumentsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
      <path strokeLinecap="round" d="M8.5 13h7M8.5 17h5" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 20c0-3.31 2.69-6 6-6s6 2.69 6 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 5.5a3.25 3.25 0 0 1 0 6.5M20.5 20c0-2.9-2.1-5.3-4.86-5.86" />
    </svg>
  );
}

function ItemsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8v8l9 5 9-5V8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 13v8" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5-5-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12H9" />
    </svg>
  );
}

export function Sidebar({ billingBanner, onNavigate }: SidebarProps) {
  const { logout } = useAuth();
  const { pathname, search } = useLocation();
  const active = (to: string) => isLinkActive(pathname, search, to);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500">
          <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </span>
        <BusinessSwitcher />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        <SidebarLink to="/dashboard" isActive={pathname === "/dashboard"} onNavigate={onNavigate} icon={<DashboardIcon />}>
          Dashboard
        </SidebarLink>
        <SidebarLink to="/revenue" isActive={pathname === "/revenue"} onNavigate={onNavigate} icon={<RevenueIcon />}>
          Revenue
        </SidebarLink>
        <SidebarLink
          to="/receivables"
          isActive={pathname === "/receivables"}
          onNavigate={onNavigate}
          icon={<ReceivablesIcon />}
        >
          Receivables
        </SidebarLink>

        <p className="mt-4 px-3 font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Documents
        </p>
        <SidebarLink to="/documents" isActive={active("/documents")} onNavigate={onNavigate} icon={<DocumentsIcon />}>
          All documents
        </SidebarLink>
        {DOCUMENT_TYPES.map((type) => (
          <SidebarLink
            key={type}
            to={`/documents?type=${type}`}
            isActive={active(`/documents?type=${type}`)}
            onNavigate={onNavigate}
            dotColor={DOCUMENT_TYPE_COLORS[type].dot}
          >
            {DOCUMENT_TYPE_LABELS[type].plural}
          </SidebarLink>
        ))}

        <div className="mt-4 flex flex-col gap-1">
          <SidebarLink to="/customers" isActive={pathname === "/customers"} onNavigate={onNavigate} icon={<CustomersIcon />}>
            Customers
          </SidebarLink>
          <SidebarLink to="/items" isActive={pathname === "/items"} onNavigate={onNavigate} icon={<ItemsIcon />}>
            Items
          </SidebarLink>
          <SidebarLink to="/activity" isActive={pathname === "/activity"} onNavigate={onNavigate} icon={<ActivityIcon />}>
            Activity
          </SidebarLink>
        </div>

        <div className="mt-4 border-t border-neutral-100 pt-4">
          <SidebarLink to="/settings" isActive={pathname === "/settings"} onNavigate={onNavigate} icon={<SettingsIcon />}>
            Settings
          </SidebarLink>
        </div>
      </nav>

      <div className="flex flex-col gap-3 px-4 py-4">
        {billingBanner && (
          <p className="rounded-lg bg-warning-bg px-3 py-2 font-sans text-xs text-warning" role="status">
            {billingBanner}
          </p>
        )}
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setIsLogoutConfirmOpen(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 font-sans text-sm font-medium text-neutral-600 transition-colors hover:bg-error-bg hover:text-error"
        >
          <LogoutIcon />
          Log out
        </button>
      </div>

      <Modal isOpen={isLogoutConfirmOpen} onClose={() => setIsLogoutConfirmOpen(false)} title="Log out">
        <p className="font-sans text-sm text-neutral-600">Log out of Billa?</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogoutConfirmOpen(false);
              logout();
            }}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Log out
          </button>
        </div>
      </Modal>
    </div>
  );
}
