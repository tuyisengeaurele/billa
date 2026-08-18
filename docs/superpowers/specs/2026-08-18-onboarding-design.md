# Billa — Onboarding Flow (Stage 5)

Date: 2026-08-18

## Scope

Client UI only. Wires up the already-built backend (business profile PATCH,
logo upload, background removal, color extraction, logo confirm) into a
two-step wizard shown right after registration, plus a minimal Dashboard
stub page as the landing spot once onboarding is done or skipped.

No changes to `/auth/register`, no "has completed onboarding" flag on the
business — root (`/`) keeps redirecting to `/onboarding` for now. Revisiting
that redirect to distinguish new vs. returning users is a later stage's
problem, once there's an actual dashboard/documents feature to redirect
returning users to instead.

## Step flow

`Onboarding.tsx` owns `step: "details" | "logo"` and renders one of two step
components from a new `client/src/components/onboarding/` folder:
`DetailsStep` and `LogoStep`. No nested routes — both steps live under the
single `/onboarding` route, consistent with the rest of the app staying
flat.

A small progress indicator ("Step 1 of 2" / "Step 2 of 2") sits above the
step content. A "Skip for now" link is visible on both steps and navigates
straight to `/dashboard` without calling any API.

`Dashboard.tsx` is a new minimal stub page (business name + a welcome line)
— the real dashboard/documents UI is a separate future stage.

## Step 1: Business details

Fields: `tin`, `industry` (free text, not a dropdown), `phone`, `email`
(business email, distinct from the user's login email), `address`,
`rraEbmNumber`. All optional.

**Shared schema change** (`shared/src/business-schemas.ts`): split the
field-level rules out from the "at least one field" refine so the client can
validate per-field without that constraint:

```ts
export const businessProfileFields = z.object({
  name: z.string().trim().min(1).optional(),
  tin: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  address: z.string().trim().min(1).optional(),
  rraEbmNumber: z.string().trim().min(1).optional(),
});

export const businessProfileSchema = businessProfileFields.refine(
  (data) => Object.keys(data).length > 0,
  { message: "at least one field is required" },
);
```

The server's `PATCH /business` contract is unchanged — it still validates
with the refined `businessProfileSchema`. The client uses
`businessProfileFields` directly with `zodResolver`, so an all-empty form is
valid client-side (per-field format rules like email still apply to any
field that *is* filled in).

**On Continue**: build a payload from only the fields with a non-empty
trimmed value. If the payload is non-empty, `PATCH /business` with it; on
success (or if there was nothing to send), advance to the logo step. On
failure, show an inline error banner (same pattern as Login/Register) and
stay on the step.

**On Skip**: advance to the logo step, no API call.

## Step 2: Logo & brand

State machine inside `LogoStep`: `"upload" | "processing" | "review"`.

1. **upload** — dropzone/file input, "Upload your logo" prompt, skip link.
   On file select: `POST /business/logo` (multipart) → `url`.
2. **processing** — a designed loading state ("Checking your logo…") while
   sequentially calling `POST /business/logo/remove-background` then
   `POST /business/logo/extract-colors` with that url.
3. **review** — show the processed logo against both a light background and
   the brand-raspberry panel (proving visibility, same approach as the auth
   screens' logo treatment), the extracted primary swatch, up to 6 accent
   swatches, and the contrast ratio. Actions:
   - **Use these colors** → confirm
   - **Adjust colors** → reveals native `<input type="color">` pickers for
     primary + each accent swatch (no new dependency). Lets you edit or
     remove existing swatches, not add new ones beyond what was extracted.
   - **Try a different logo** → resets to `"upload"`
4. **Confirm**: `POST /business/logo/confirm` with `url` + `primaryColor` +
   `accentColors` → navigate to `/dashboard`.

Skip link stays visible through all three sub-states, not just `"upload"`.

## Error handling

API failures at any point: inline error banner, stay on the current
step/sub-state, allow retry. Upload errors (invalid file type, file too
large — both already rejected server-side) surface as field-style error
text under the dropzone.

## Testing

TDD throughout, following the existing pattern (mock `fetch`, React Testing
Library, `afterEach(cleanup)` already in place):

- `shared`: a test asserting `businessProfileFields` accepts `{}` while the
  refined `businessProfileSchema` still rejects it.
- `DetailsStep`: renders all six fields, Continue sends only filled fields,
  Skip advances without a network call, shows email-format error.
- `LogoStep`: upload → processing → review transitions, confirm posts the
  right payload and navigates, "try a different logo" resets to upload,
  skip works from any sub-state.
- `Onboarding`: renders the right step component, progress indicator text,
  step transition from details → logo.
- `Dashboard`: renders the business name.

## Not covered here

The real dashboard/documents UI, a Settings page for editing business
details after onboarding, and any "resume onboarding where you left off"
persistence — none of that exists yet and isn't needed for this stage.
