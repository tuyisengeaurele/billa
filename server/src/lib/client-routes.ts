// The pages the web app really has, copied from client/src/App.tsx (a test fails if the two drift apart).
// The server uses this to answer a page request with the right status: 200 for a real page and 404 for an
// address that is not one, while still serving the app shell so the app can show its own "not found" screen.
// Without it every wrong address looks like a real page to Google.
const CLIENT_ROUTES = [
  "/",
  "/login",
  "/admin/login",
  "/register",
  "/privacy",
  "/terms",
  "/help",
  "/developers",
  "/contact",
  "/view/:token",
  "/portal/:token",
  "/invite/:token",
  "/onboarding",
  "/dashboard",
  "/revenue",
  "/receivables",
  "/activity",
  "/customers",
  "/customers/:id/statement",
  "/items",
  "/documents",
  "/documents/new",
  "/documents/:id/edit",
  "/documents/:id",
  "/settings",
  "/profile",
  "/notifications",
  "/admin",
  "/admin/metrics",
  "/admin/messages",
  "/admin/users",
  "/admin/users/:id",
  "/admin/businesses",
  "/admin/businesses/:id",
  "/admin/audit-log",
  "/admin/system-health",
  "/admin/announcements",
  "/admin/profile",
  "/admin/notifications",
] as const;

function toPattern(route: string): RegExp {
  const source = route
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}/?$`);
}

const PATTERNS = CLIENT_ROUTES.map(toPattern);

export const CLIENT_ROUTE_LIST: readonly string[] = CLIENT_ROUTES;

export function isKnownClientRoute(pathname: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(pathname));
}
