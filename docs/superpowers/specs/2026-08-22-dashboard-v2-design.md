# Dashboard V2: Card Actions and Document Metrics

**Goal:** Upgrade the Dashboard's quick actions from small pill links into proper cards, and add real document-activity metrics (counts and trend, never money) so the page earns its place as the app's front door.

## Quick actions as cards

The five document-type links (New invoice, New proforma invoice, New delivery note, New quote, New receipt) become a grid of cards instead of a row of pill buttons: each card gets its own colored icon accent, the type name, and a short one-line description of what that document is for (reusing the same wording already established on the landing page's document-types section, for consistency across the product). Same destinations (`/documents/new?type=X`), same five types, just a more considered visual treatment.

## Document metrics

Per the research on how mature SaaS dashboards (Stripe, Linear, Mercury) are built in 2026 — lead with one clear number and treat drafts/overdue items as actionable work queues rather than burying them in a wall of charts — the new metrics section adds exactly three things, all derived from document activity, never money:

1. **Headline stat:** documents created this month, with a plain-language comparison to last month ("3 more than last month" / "same as last month" / "3 fewer than last month"). This is a stat tile, not a chart.
2. **Documents by type:** a single-hue horizontal bar chart, one bar per document type, showing how many of each have ever been created. This is a magnitude comparison across named categories, not an identity comparison, so it uses one brand hue throughout rather than five different colors — the row labels already distinguish the categories.
3. **14-day activity:** a single-hue line chart of documents created per day over the last 14 days (including zero-count days, so the line is continuous), with a hover tooltip showing the exact date and count.

Both charts are built with a real charting library (Recharts) rather than hand-rolled SVG, styled to match the app's existing type and color tokens (Fraunces for headline numbers, Plus Jakarta Sans for labels, the primary magenta for chart marks), with proper hover interactivity on both.

The existing attention cards (drafts waiting, overdue invoices), recent documents list, and first-time empty state are unchanged.

## Data

`GET /dashboard/summary` gains three fields:

```ts
interface DashboardSummary {
  draftCount: number;
  overdueInvoiceCount: number;
  recentDocuments: RecentDocument[];
  documentsThisMonth: number;
  documentsLastMonth: number;
  documentsByType: { type: DocumentType; count: number }[];
  activityByDay: { date: string; count: number }[]; // last 14 days, oldest first, YYYY-MM-DD
}
```

`documentsByType` always includes all five types, even at zero, so the bar chart never has to handle a missing category. `activityByDay` always has exactly 14 entries, oldest to newest, even on days with no activity, so the line is continuous.

## What doesn't change

The empty-state behavior (zero documents ever) still replaces the attention and recent-documents sections, but now also skips the metrics section — a business with no documents has no meaningful "this month vs last month" comparison or trend to show, and an all-zero chart would just be visual noise.

## Testing

Server: extend `dashboard.summary.test.ts` to cover the month-over-month counts, that `documentsByType` includes all five types even when some have zero documents, and that `activityByDay` has exactly 14 entries including zero-count days.

Client: extend `Dashboard.test.tsx` to cover the new headline stat rendering the comparison text correctly in all three directions (more/fewer/same), and that the metrics section doesn't render in the empty-state case. Chart rendering itself (Recharts internals) isn't unit-tested beyond confirming the components mount without throwing — real visual correctness is verified in the browser, matching how chart-heavy dashboards are practically tested elsewhere.
