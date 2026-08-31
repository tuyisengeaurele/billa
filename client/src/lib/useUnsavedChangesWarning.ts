import { useEffect } from "react";

/**
 * Warns the user via the browser's native confirmation dialog before they
 * close the tab, refresh, or navigate to a different URL while `isDirty` is
 * true. Does not cover in-app (React Router) navigation — beforeunload only
 * fires on a real page unload, not a client-side route change.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
