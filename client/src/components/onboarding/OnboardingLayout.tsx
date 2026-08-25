import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface OnboardingLayoutProps {
  stepLabel: string;
  onSkipAll: () => void;
  children: ReactNode;
}

export function OnboardingLayout({ stepLabel, onSkipAll, children }: OnboardingLayoutProps) {
  return (
    <div className="flex min-h-screen justify-center bg-neutral-50 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-xl"
      >
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              {stepLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onSkipAll}
            className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
          >
            Skip onboarding
          </button>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-surface p-8 shadow-sm">{children}</div>
      </motion.div>
    </div>
  );
}
