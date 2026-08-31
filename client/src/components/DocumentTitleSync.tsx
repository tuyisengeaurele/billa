import { useEffect } from "react";
import { usePageTitleSegments } from "../context/PageTitleContext";

/** Keeps the browser tab title in sync with the current page's breadcrumb. */
export function DocumentTitleSync() {
  const segments = usePageTitleSegments();

  useEffect(() => {
    const current = segments[segments.length - 1]?.label;
    document.title = current ? `${current} - Billa` : "Billa";
  }, [segments]);

  return null;
}
