import type { ReactNode } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Modal } from "../Modal";
import { ThemeToggle } from "../ThemeToggle";
import {
  AnnouncementsIcon,
  AuditLogIcon,
  BusinessesIcon,
  LogoutIcon,
  MessagesIcon,
  MetricsIcon,
  SystemHealthIcon,
  UsersIcon,
} from "./icons";

interface AdminSidebarProps {
  onNavigate?: () => void;
}

const NAV_LINKS = [
  { to: "/admin/metrics", label: "Metrics", icon: <MetricsIcon /> },
  { to: "/admin/users", label: "Users", icon: <UsersIcon /> },
  { to: "/admin/businesses", label: "Businesses", icon: <BusinessesIcon /> },
  { to: "/admin/messages", label: "Messages", icon: <MessagesIcon /> },
  { to: "/admin/audit-log", label: "Audit log", icon: <AuditLogIcon /> },
  { to: "/admin/system-health", label: "System health", icon: <SystemHealthIcon /> },
  { to: "/admin/announcements", label: "Announcements", icon: <AnnouncementsIcon /> },
];

function AdminSidebarLink({
  to,
  children,
  isActive,
  onNavigate,
  icon,
}: {
  to: string;
  children: ReactNode;
  isActive: boolean;
  onNavigate?: () => void;
  icon: ReactNode;
}) {
  return (
    <Link to={to} onClick={onNavigate} className="relative block rounded-lg px-3 py-2 font-sans text-sm font-medium">
      {isActive && (
        <motion.span
          layoutId="admin-sidebar-active-pill"
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
        {children}
      </span>
    </Link>
  );
}

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500">
          <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </span>
        <span className="font-display text-base font-semibold text-neutral-900">Billa Admin</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_LINKS.map((link) => (
          <AdminSidebarLink
            key={link.to}
            to={link.to}
            isActive={pathname.startsWith(link.to)}
            onNavigate={onNavigate}
            icon={link.icon}
          >
            {link.label}
          </AdminSidebarLink>
        ))}
      </nav>

      <div className="flex flex-col gap-3 px-4 py-4">
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
        <p className="font-sans text-sm text-neutral-600">Log out of the admin dashboard?</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogoutConfirmOpen(false);
              logout();
            }}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Log out
          </button>
        </div>
      </Modal>
    </div>
  );
}
