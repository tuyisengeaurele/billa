import { Outlet } from "react-router-dom";
import { ActiveDocumentTypeProvider } from "../context/ActiveDocumentTypeContext";
import { AppLayout } from "./AppLayout";

// Renders the sidebar shell once per session instead of once per page, so
// navigating between pages doesn't remount the sidebar (which reset its
// scroll position and interrupted the active-link animation).
export function AppLayoutRoute() {
  return (
    <ActiveDocumentTypeProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ActiveDocumentTypeProvider>
  );
}
