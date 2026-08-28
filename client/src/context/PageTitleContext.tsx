import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface PageTitleSegment {
  label: string;
  // Omit on the current page's own segment; set it on a parent segment
  // (e.g. "Users") to make it a link back to that list.
  href?: string;
}

type PageTitleInput = string | PageTitleSegment[];

interface PageTitleContextValue {
  segments: PageTitleSegment[];
  setSegments: (segments: PageTitleSegment[]) => void;
}

// Defaults to a no-op so a layout or page can read/set this even outside a
// PageTitleProvider (e.g. in isolated component tests).
const PageTitleContext = createContext<PageTitleContextValue>({ segments: [], setSegments: () => {} });

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [segments, setSegments] = useState<PageTitleSegment[]>([]);
  return <PageTitleContext.Provider value={{ segments, setSegments }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleSegments(): PageTitleSegment[] {
  return useContext(PageTitleContext).segments;
}

function normalize(title: PageTitleInput): PageTitleSegment[] {
  return typeof title === "string" ? [{ label: title }] : title;
}

// Pages call this instead of rendering their own <h1>, so the layout can show
// the current section (as a breadcrumb, when given a list of segments) in the
// top bar and stay in sync as pages change. A parent segment with an `href`
// renders as a link back to that list, easing the way back.
export function usePageTitle(title: PageTitleInput): void {
  const { setSegments } = useContext(PageTitleContext);
  const key = JSON.stringify(normalize(title));
  useEffect(() => {
    setSegments(normalize(title));
    return () => setSegments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setSegments]);
}
