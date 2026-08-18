# Billa — Color Extraction & Logo Confirm (Stage 3d)

Date: 2026-08-18

## Scope

Extract a usable accent palette from a logo via `node-vibrant`, and the final
"confirm" step that writes `logoUrl`, `primaryColor`, and `accentColors` to
the `Business` row. This closes out the whole logo pipeline: upload (3b) →
background removal (3c) → color extraction → confirm (3d). Client UI for any
of this remains a separate stage.

## Endpoints

Both under `/business/logo/*`, behind `requireAuth`, same tenant-path safety
as `remove-background`.

- **`POST /business/logo/extract-colors`** — `{ url }` → runs extraction on
  the file, returns `{ primaryColor, accentColors, contrastRatio }`. No DB
  write — a preview, same pattern as `remove-background`.
- **`POST /business/logo/confirm`** — `{ url, primaryColor, accentColors }`
  → writes `logoUrl: url`, `primaryColor`, `accentColors` to `Business` in
  one update. Takes the values at face value — the backend doesn't
  distinguish "auto-extracted, passed straight through" from "user
  hand-picked a different hex in a color override UI." Whichever the client
  sends is what gets persisted. This is the terminal step of the pipeline —
  everything before it was staged, nothing committed until here.

## Contrast-checked primary color

`server/src/lib/color.ts` — pure WCAG contrast math (relative luminance,
contrast ratio, hex↔HSL conversion), independently testable without image
fixtures.

`server/src/lib/palette.ts` — the extraction algorithm:
1. `Vibrant.from(buffer).getPalette()` (via `node-vibrant/node`, which
   accepts a Buffer directly) returns up to 6 swatches (Vibrant, DarkVibrant,
   Muted, DarkMuted, LightVibrant, LightMuted), sorted by population.
2. Walk them in population order; the first with contrast ≥ 3:1 against
   white becomes `primaryColor`. 3:1 is WCAG's threshold for large
   text/UI components — these colors are for document headers, borders, and
   brand accents, not body text, so the stricter 4.5:1 normal-text threshold
   would be over-strict here.
3. If none qualify, take the best-populated candidate and darken it
   (step down HSL lightness) until it clears 3:1.
4. `accentColors` = the next 3 best-populated swatches, unfiltered by
   contrast — they're decorative (background tints, secondary accents), not
   necessarily used as text color.

Manual overrides in `confirm` are never contrast-validated — once a user is
picking their own color, that's their call, not something the backend blocks.

## Refactor: shared tenant-path resolution

`remove-background` (stage 3c) already has "resolve a `/uploads/...` URL to
a file path scoped to the caller's business, reject with 403 otherwise."
`extract-colors` and `confirm` need the identical check. Extracting this into
`readUploadedFile(url, businessId)` in `server/src/lib/uploaded-file.ts`,
used by all three logo-processing endpoints, rather than a third copy-paste
of the same security-critical logic.

## Not covered here

Client UI (the color preview/override screen, the whole onboarding wizard)
remains a separate stage.
