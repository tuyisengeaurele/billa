import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  eyebrow: string;
  headline: string;
  tagline: string;
  children: ReactNode;
}

export function AuthLayout({ eyebrow, headline, tagline, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 overflow-hidden bg-primary-500 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25) 0, transparent 45%)",
          }}
        />
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-40 h-64 w-64 -translate-x-1/2 opacity-[0.1]"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 flex items-center gap-3"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
            <img src="/logo.png" alt="" className="h-7 w-7" />
          </span>
          <span className="font-display text-2xl font-semibold text-white">Billa</span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="relative z-10"
        >
          <p className="font-sans text-sm uppercase tracking-[0.2em] text-primary-100">{eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-white">{headline}</h1>
          <p className="mt-4 max-w-sm font-sans text-base text-primary-100">{tagline}</p>
        </motion.div>
      </div>
      <div className="flex w-full flex-col justify-center bg-white px-6 py-12 lg:w-1/2 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
