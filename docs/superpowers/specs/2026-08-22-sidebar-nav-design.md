# Sidebar Navigation Design

**Goal:** Replace `AppLayout`'s horizontal top bar, which overflows and wraps below roughly 1200px and is cramped even above it, with a left sidebar that scales cleanly at any width and matches how modern SaaS products (Linear, Notion, Stripe Dashboard) organize navigation once there's more than a handful of destinations.

## Structure

**Desktop (lg and above):** a fixed-width (256px) sidebar spanning the full viewport height, white background, a right border separating it from content.

Top to bottom inside the sidebar:
1. Logo mark + `BusinessSwitcher` (unchanged component, just relocated and restyled to sidebar width instead of a header-inline dropdown).
2. `Dashboard` link.
3. A "Documents" section: a small muted section label, then the six existing links (All documents, Invoices, Proforma invoices, Delivery notes, Quotes, Receipts) stacked vertically instead of in a row. Same hrefs as today, nothing removed.
4. `Customers` and `Items` links.
5. `Settings` link, visually separated (a divider) from the sections above since it's account-level rather than a working area.
6. Pinned to the bottom: the trial/subscription banner (when active) and the `Log out` button.

**Below lg:** the sidebar is hidden by default. A slim top bar (logo + a hamburger button) replaces it. Tapping the hamburger slides the same sidebar content in from the left as an overlay with a dismissible backdrop; selecting a link or tapping the backdrop closes it.

**Main content area:** to the right of the sidebar on desktop, full width below it on mobile, unchanged in its own padding/scroll behavior.

## Component boundaries

- `client/src/components/Sidebar.tsx` (new): the nav content itself (logo, switcher, links, banner, logout). Takes no props beyond an optional `onNavigate` callback so the mobile drawer can close itself when a link is clicked.
- `client/src/components/AppLayout.tsx` (modified): owns the mobile-drawer open/closed state and the responsive shell (desktop sidebar + mobile hamburger + overlay), renders `Sidebar` and `{children}`.

## What doesn't change

Every route, every link's destination, the billing-banner logic, and the logout behavior are identical to today — this is purely a structural and visual reorganization of the same navigation, not a scope or behavior change. No page other than `AppLayout` itself needs to change.

## Testing

`client/src/components/Sidebar.test.tsx`: renders all expected links (Dashboard, each document type, Customers, Items, Settings), calls `onNavigate` when a link is clicked, calls logout when the logout button is clicked.

`client/src/components/AppLayout.test.tsx` (existing file, extended): the desktop sidebar's links are present without needing to open anything; on a narrow viewport, links are hidden until the hamburger is clicked, then visible, then hidden again after clicking a link or the backdrop.
