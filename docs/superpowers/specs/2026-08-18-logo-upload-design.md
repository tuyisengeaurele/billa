# Billa — Logo Upload & Storage (Stage 3b)

Date: 2026-08-18

## Scope

Backend only: a single endpoint that validates and stores an uploaded logo
file, returning a URL. No database write, no background removal, no color
extraction — those are separate later stages (3c, 3d).

## Commit timing

Uploading does **not** set `Business.logoUrl`. The spec's flow is
upload → background-removal preview → confirm, and nothing should be treated
as "the logo" until the user explicitly confirms at the end of that flow
(stage 3d). The client holds the returned URL through the intermediate
preview steps; only the eventual confirm step writes to the `Business` row.
This keeps this stage schema-free — no draft/pending fields needed.

## Storage abstraction

A small interface so local disk (dev) and S3-compatible storage (prod) share
the same call site:

```ts
interface LogoStorage {
  save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }>;
}
```

`LocalDiskStorage` is the only implementation for now — writes under
`UPLOADS_DIR/<businessId>/<generated-name>.<ext>` (server-generated filename,
never the client's original, to avoid path traversal or collisions) and files
are served back via Express static middleware mounted at `/uploads`.
Swapping to S3 later means writing one new class against `LogoStorage`, no
route or validation changes.

## Validation

Per the multi-tenancy security requirements (type, size, and actual content
sniffing — not just trusting the extension):

- `multer` with memory storage, `limits.fileSize` capped at 5MB
- Accepted formats: PNG, JPEG, WebP. SVG is excluded — it's vector, and the
  background-detection stage (3c) needs raster pixel data (alpha channel /
  corner-pixel sampling).
- After multer parses the upload, the real file signature is sniffed with
  `file-type` (reads magic bytes) and compared against the declared MIME
  type. A mismatch is rejected — this is what stops a renamed `.exe` or
  script from posing as a `.png`.

## Endpoint

`POST /business/logo`, behind `requireAuth`, multipart field name `logo`.

- 201 with `{ url }` on success
- 400 for missing file, wrong type (declared or sniffed), or oversized file
- 401 without a session

## Not covered here

Background detection/removal, color extraction, the confirm step that writes
`Business.logoUrl`, and any client UI are separate stages.
