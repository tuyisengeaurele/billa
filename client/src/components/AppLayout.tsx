import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link to="/documents?type=INVOICE" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Invoices
          </Link>
          <Link to="/customers" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Customers
          </Link>
          <Link to="/items" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Items
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
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
