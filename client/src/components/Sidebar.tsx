import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { DOCUMENT_TYPES } from "@billa/shared";
import { useAuth } from "../context/AuthContext";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { BusinessSwitcher } from "./BusinessSwitcher";

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
}: {
  to: string;
  children: ReactNode;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`block rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors ${
        isActive ? "bg-primary-100 text-primary-700" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      {children}
    </Link>
  );
}

export function Sidebar({ billingBanner, onNavigate }: SidebarProps) {
  const { logout } = useAuth();
  const { pathname, search } = useLocation();
  const active = (to: string) => isLinkActive(pathname, search, to);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500">
          <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </span>
        <BusinessSwitcher />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        <SidebarLink to="/dashboard" isActive={pathname === "/dashboard"} onNavigate={onNavigate}>
          Dashboard
        </SidebarLink>

        <p className="mt-4 px-3 font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Documents
        </p>
        <SidebarLink to="/documents" isActive={active("/documents")} onNavigate={onNavigate}>
          All documents
        </SidebarLink>
        {DOCUMENT_TYPES.map((type) => (
          <SidebarLink
            key={type}
            to={`/documents?type=${type}`}
            isActive={active(`/documents?type=${type}`)}
            onNavigate={onNavigate}
          >
            {DOCUMENT_TYPE_LABELS[type].plural}
          </SidebarLink>
        ))}

        <div className="mt-4 flex flex-col gap-1">
          <SidebarLink to="/customers" isActive={pathname === "/customers"} onNavigate={onNavigate}>
            Customers
          </SidebarLink>
          <SidebarLink to="/items" isActive={pathname === "/items"} onNavigate={onNavigate}>
            Items
          </SidebarLink>
        </div>

        <div className="mt-4 border-t border-neutral-100 pt-4">
          <SidebarLink to="/settings" isActive={pathname === "/settings"} onNavigate={onNavigate}>
            Settings
          </SidebarLink>
        </div>
      </nav>

      <div className="flex flex-col gap-3 border-t border-neutral-100 px-4 py-4">
        {billingBanner && (
          <p className="rounded-lg bg-warning-bg px-3 py-2 font-sans text-xs text-warning" role="status">
            {billingBanner}
          </p>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="text-left font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
