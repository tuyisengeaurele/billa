# Billa — Background Detection & Removal (Stage 3c)

Date: 2026-08-18

## Scope

Detect whether an already-uploaded logo (from stage 3b) needs its background
removed, and if so, remove it via a self-hosted `rembg` microservice. Still
doesn't touch `Business.logoUrl` — same "nothing commits until confirm" rule
as the upload stage. Color extraction and the final confirm step are stage 3d.

## Removal service choice: rembg over remove.bg

Chose self-hosted `rembg` (Python/FastAPI) over the remove.bg API.

**Tradeoff:** remove.bg is a single HTTP call with zero extra infrastructure,
but costs per image past a small free tier and requires an external account/API
key. rembg has no per-image cost and no external account, but means running a
second service in a different language stack (Python), downloading ML models
(~100MB+ on first run), and keeping that service alive alongside the Node
backend in both dev and prod. User chose rembg — no ongoing per-image cost
outweighs the extra operational piece for this project.

## Model choice: u2net, not rembg's default

`rembg`'s own default model (`bria-rmbg-2.0`) is licensed CC BY-NC 4.0 —
non-commercial, requiring a paid agreement with BRIA AI for commercial use.
Billa is a commercial SaaS, so the service explicitly requests `u2net`
instead (Apache 2.0, free for commercial use) via `new_session("u2net")`
rather than calling `remove()` with no session and silently inheriting
rembg's default.

## Python microservice

`/bg-removal-service` — a FastAPI app wrapping the `rembg` library.

- `POST /remove-background` — raw image bytes in, processed PNG bytes (with
  alpha transparency) out.
- This is a thin wrapper (~20 lines) around a well-tested third-party ML
  library. Verified manually via curl rather than a pytest suite — the actual
  segmentation logic isn't code we're writing or need to unit test, unlike the
  business logic on the Node side.
- Run via `uvicorn` in a Python virtualenv, documented in a README with setup
  and run commands. No automated dev orchestration (e.g. docker-compose) —
  two manual startup commands is proportionate for a solo-dev v1.

## Node-side pieces

**`detectBackground(buffer)`** (via `sharp`):
- Reads the image as raw RGBA. If it has an alpha channel and more than 1% of
  pixels have alpha < 250, treats it as already having a meaningful
  transparent background (`hasTransparency: true`) — removal is skipped.
- If not, samples the 4 corner pixels and checks color-distance uniformity
  as an informational signal (`cornersUniform`) — returned to the caller but
  doesn't gate whether removal runs, since ML-based removal handles both flat
  and complex backgrounds.
- Returns `{ hasTransparency, cornersUniform, needsRemoval }` where
  `needsRemoval = !hasTransparency`.

**`removeBackground(buffer)`**: a thin HTTP client posting to
`REMBG_SERVICE_URL`, returning the processed PNG buffer. Mocked via
`vi.spyOn(global, 'fetch')` in tests so the suite doesn't depend on the Python
service actually running.

**`POST /business/logo/remove-background`** (behind `requireAuth`):
- Body: `{ url }` — the URL returned by the stage-3b upload endpoint.
- Validates the URL starts with `/uploads/<req.auth.businessId>/` and
  contains no path traversal — rejects otherwise. This is what stops one
  business from reading another's uploaded file, or reading arbitrary files
  off disk.
- Reads the file, runs `detectBackground`. If `needsRemoval` is false,
  returns `{ url, backgroundRemoved: false, detection }` (pass-through, no
  new file). Otherwise calls `removeBackground`, saves the result via the
  existing `LocalDiskStorage`, returns `{ url: newUrl, backgroundRemoved: true, detection }`.

## Not covered here

Color extraction, the confirm step that writes `Business.logoUrl`, and any
client UI remain separate stages.
