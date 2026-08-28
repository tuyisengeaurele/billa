# Toast Notification System — Design

**Status:** Approved, ready for implementation planning.

## Problem

Billa has no consistent mechanism for telling the user "that action worked" or
"that action failed." Every page invents its own pattern: some show inline text
next to a button ("Portal link copied"), some show a banner styled like a page
error (`role="alert"`, `bg-error-bg`) for what's actually a transient result,
and some show nothing at all beyond a modal closing. This is the kind of
inconsistency that separates "functional" from a premium-feeling product.

## Scope

Two parts, both approved to ship together:

1. Build a new toast system (provider, hook, component).
2. Retrofit the existing ad hoc feedback across the app to use it, per the
   inline-vs-toast rule below. This includes updating every existing test that
   currently asserts on the inline text being replaced.

## The inline-vs-toast rule

A result becomes a **toast** when the UI context that produced it disappears or
never had a natural place to show the result: a modal closes, a row is removed
from a list, a background export finishes, a button-triggered action completes
with nothing else on screen to hold the message.

A result **stays inline** when the thing that produced it is still visible on
screen and the message belongs right next to it:
- Field-level validation errors (`FormField.tsx` and everything that renders
  through it: `ItemForm.tsx`, `CustomerForm.tsx`, onboarding steps, etc.)
- Page-load failure banners ("Couldn't load this customer") — these describe
  the page's current content state, not a completed action; they shouldn't be
  dismissible or auto-expire like a toast.
- Auth-form submission errors (`Login.tsx`, `Register.tsx`, `AdminLogin.tsx`,
  `AcceptInvite.tsx`, `Contact.tsx`) — the form stays on screen for the user to
  retry, and their attention is already there, not in a corner.
- Inline "invite a teammate" / settings-form submit errors where the form
  itself remains visible (e.g. `TeamSection.tsx`'s invite error,
  `TwoFactorSection.tsx`'s setup error) — same reasoning as auth forms.

Concrete toast candidates identified so far (implementation plan should treat
this as a starting list, not exhaustive — apply the rule above to any file not
listed here):

| Action | File | Current pattern |
|---|---|---|
| Copy portal link | `CustomerStatement.tsx` | inline text swap |
| CSV export success/failure | `ExportCsvButton.tsx`, `AdminBusinesses.tsx`, `AdminUsers.tsx` | inline banner/text |
| Item save / delete | `Items.tsx` | none today |
| Customer save / delete | `Customers.tsx` | none today |
| Document save / delete / convert | `DocumentForm.tsx`, `DocumentView.tsx` | none today |
| Business settings save | `BusinessSettings.tsx` | none today |
| Profile save (name, avatar, password) | `Profile.tsx` | none today |
| Admin actions (extend trial, ban user, resolve message) | `AdminBusinessDetail.tsx`, `AdminUserDetail.tsx`, `AdminMessages.tsx` | none today |
| Announcement publish | `AdminAnnouncements.tsx` | none today |
| Session revoke / revoke-others | `Profile.tsx` | none today |
| Write-off save (receivables) | `Receivables.tsx` | none today |
| Credit note / document duplication | `Documents.tsx` | none today |

Files explicitly out of scope (stay inline, no change): `FormField.tsx`,
`ItemForm.tsx`, `CustomerForm.tsx`, `SearchDropdown.tsx`, `CustomerPicker.tsx`,
`DetailsStep.tsx`, `LogoStep.tsx`, `Login.tsx`, `Register.tsx`,
`AdminLogin.tsx`, `AcceptInvite.tsx`, `Contact.tsx`, and every page's
load-failure banner (`Couldn't load this X. Try again.`).

## Architecture

- `client/src/context/ToastContext.tsx` — `ToastProvider` (holds an array of
  active toasts in state) + `useToast()` hook returning
  `{ success(message), error(message) }`.
- `client/src/components/Toast.tsx` — renders one toast; uses framer-motion
  (`AnimatePresence`/`motion.div`) matching `Modal.tsx`'s existing
  enter/exit-animation pattern, so the codebase doesn't gain a new animation
  idiom or a new dependency.
- `ToastProvider` is mounted in `App.tsx` alongside `ThemeProvider`, outside
  `<Routes>`, so toasts work on every route including public/customer-facing
  pages (e.g. the portal-link-copy toast on `CustomerStatement.tsx`).

## Behavior

- **Position:** bottom-right, stacked, newest closest to the corner.
- **Cap:** 4 visible at once; a 5th bumps the oldest out immediately (no queue
  — action-result toasts are rare enough in any single flow that a queue would
  be over-engineering).
- **Success:** auto-dismisses after 4s, `aria-live="polite"` (non-interruptive
  — matches how a fleeting confirmation should behave for screen readers).
- **Error:** stays until the user dismisses it via a close (×) button,
  `role="alert"` (matches the `aria-live="assertive"` behavior already used by
  every existing inline error banner in the app, so the retrofit doesn't change
  how errors read to assistive tech, only where they render).
- **Motion:** simple opacity + vertical-slide enter/exit, matching
  `Modal.tsx`'s existing animation style. Neither `Modal.tsx` nor anything else
  in the app currently gates on `prefers-reduced-motion` — that's a pre-existing
  gap across the whole app, not something this pass introduces or is
  responsible for fixing.

## API

```tsx
const toast = useToast();
toast.success("Item saved");
toast.error("Couldn't save that item. Try again.");
```

No `info` or `warning` variant — the two behaviors above (auto-dismiss vs.
persist-until-dismissed) are the only two the app currently needs, and adding
a third variant with no distinct behavior would just be unused surface area.

## Testing cost (accepted)

Every retrofitted flow currently has tests asserting on the inline text being
replaced (e.g. `findByText("Portal link copied")`,
`findByText(/couldn't export/i)`). Each of those needs updating to assert on
the toast instead. This is comparable in size to the `<h1>`-removal test-fix
pass done earlier in this session — mechanical, file-by-file, not risky, but
real work that the implementation plan must account for as its own step per
file, not an afterthought.

## Out of scope for this pass

- A toast triggered from outside React (e.g. a service worker) — not a
  pattern this app uses today.
- Persisting toast history anywhere (no "notification log" — that's what the
  existing `Notifications.tsx` page / `NotificationBell.tsx` already cover for
  durable, cross-session notifications; toasts are purely transient UI
  feedback for the action just taken in this tab).
