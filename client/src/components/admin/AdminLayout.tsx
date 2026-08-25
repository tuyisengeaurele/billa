import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
  AuditLogIcon,
  BackIcon,
  BusinessesIcon,
  MessagesIcon,
  MetricsIcon,
  SystemHealthIcon,
  UsersIcon,
} from "./icons";

interface AdminLayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { to: "/admin/metrics", label: "Metrics", icon: <MetricsIcon /> },
  { to: "/admin/users", label: "Users", icon: <UsersIcon /> },
  { to: "/admin/businesses", label: "Businesses", icon: <BusinessesIcon /> },
  { to: "/admin/messages", label: "Messages", icon: <MessagesIcon /> },
  { to: "/admin/audit-log", label: "Audit log", icon: <AuditLogIcon /> },
  { to: "/admin/system-health", label: "System health", icon: <SystemHealthIcon /> },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-neutral-200 bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-6">
            <span className="flex shrink-0 items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900">
                <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
              </span>
              <span className="font-display text-base font-semibold text-neutral-900">Billa Admin</span>
            </span>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV_LINKS.map((link) => {
                const isActive = pathname.startsWith(link.to);
                return (
                  <Link key={link.to} to={link.to} className="relative shrink-0 rounded-lg px-3 py-2">
                    {isActive && (
                      <motion.span
                        layoutId="admin-nav-active-pill"
                        className="absolute inset-0 rounded-lg bg-primary-100"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                    <span
                      className={`relative z-10 flex items-center gap-2 whitespace-nowrap font-sans text-sm font-medium transition-colors ${
                        isActive ? "text-primary-700" : "text-neutral-600 hover:text-neutral-900"
                      }`}
                    >
                      {link.icon}
                      {link.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-1.5 font-sans text-sm text-neutral-600 transition-colors hover:text-neutral-900"
          >
            <BackIcon />
            Back to app
          </Link>
        </div>
      </header>
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="mx-auto max-w-5xl px-6 py-8"
      >
        {children}
      </motion.main>
    </div>
  );
}
