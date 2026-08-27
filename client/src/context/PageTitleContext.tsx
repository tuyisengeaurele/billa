import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PageTitleContextValue {
  title: string;
  setTitle: (title: string) => void;
}

// Defaults to a no-op so a layout or page can read/set this even outside a
// PageTitleProvider (e.g. in isolated component tests).
const PageTitleContext = createContext<PageTitleContextValue>({ title: "", setTitle: () => {} });

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("");
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleValue(): string {
  return useContext(PageTitleContext).title;
}

// Pages call this instead of rendering their own <h1>, so the layout can show
// the current section name in the top bar and stay in sync as pages change.
export function usePageTitle(title: string): void {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle("");
  }, [title, setTitle]);
}
