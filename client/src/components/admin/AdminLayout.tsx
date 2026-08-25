import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

interface AdminLayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/businesses", label: "Businesses" },
  { to: "/admin/messages", label: "Messages" },
  { to: "/admin/audit-log", label: "Audit log" },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-neutral-200 bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-display text-base font-semibold text-neutral-900">Billa Admin</span>
            <nav className="flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`font-sans text-sm font-medium ${
                    pathname.startsWith(link.to) ? "text-primary-700" : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link to="/dashboard" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
