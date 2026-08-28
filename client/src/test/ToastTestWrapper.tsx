import type { ReactNode } from "react";
import { ToastProvider } from "../context/ToastContext";
import { ToastContainer } from "../components/ToastContainer";

/** Wrap a test's rendered tree with this so toast assertions (`findByRole("status")`, `findByRole("alert")`) work. */
export function ToastTestWrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}
