import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface LegalPageLayoutProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export function LegalPageLayout({ title, updated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
          </Link>
          <Link to="/" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">{title}</h1>
        <p className="mt-2 font-sans text-sm text-neutral-500">Last updated {updated}</p>
        <div className="mt-10 flex flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
