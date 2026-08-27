import { Outlet } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";

// Renders the admin shell once per session instead of once per page, so
// navigating between admin pages doesn't remount the sidebar, and so a page's
// usePageTitle() call reaches the header's PageTitleProvider (which AdminLayout
// itself provides, as its own ancestor here, not as a descendant of the page).
export function AdminLayoutRoute() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
