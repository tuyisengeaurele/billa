import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DocumentType } from "@billa/shared";

interface ActiveDocumentTypeContextValue {
  activeDocumentType: DocumentType | null;
  setActiveDocumentType: (type: DocumentType | null) => void;
}

// Defaults to a no-op so pages that read or set this outside an
// ActiveDocumentTypeProvider (e.g. in isolated component tests) still work.
const ActiveDocumentTypeContext = createContext<ActiveDocumentTypeContextValue>({
  activeDocumentType: null,
  setActiveDocumentType: () => {},
});

export function ActiveDocumentTypeProvider({ children }: { children: ReactNode }) {
  const [activeDocumentType, setActiveDocumentType] = useState<DocumentType | null>(null);
  return (
    <ActiveDocumentTypeContext.Provider value={{ activeDocumentType, setActiveDocumentType }}>
      {children}
    </ActiveDocumentTypeContext.Provider>
  );
}

export function useActiveDocumentType(): DocumentType | null {
  return useContext(ActiveDocumentTypeContext).activeDocumentType;
}

// Pages that represent a single document type (creating, editing, or viewing one)
// call this so the sidebar can highlight that type's link instead of nothing.
export function useSetActiveDocumentType(type: DocumentType | null | undefined): void {
  const { setActiveDocumentType } = useContext(ActiveDocumentTypeContext);
  useEffect(() => {
    setActiveDocumentType(type ?? null);
    return () => setActiveDocumentType(null);
  }, [type, setActiveDocumentType]);
}
