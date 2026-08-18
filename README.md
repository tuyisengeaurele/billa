# Billa

Documents-only SaaS for SMEs (starting in Rwanda) to generate invoices, proforma invoices,
delivery notes, quotes, and receipts. No bookkeeping, no payment tracking — just fast,
professional business documents.

## Repo structure

npm workspaces monorepo: `/client`, `/server`, `/shared`.

Went with a single repo instead of splitting client/server into separate repos because
`/shared` holds the Zod validation schemas both sides import — invoice line-item validation,
customer/item shapes, auth payloads. Splitting repos would mean hand-syncing that logic or
publishing an internal package, which is overkill for a solo-dev v1. No Turborepo/Nx on top —
npm workspaces alone is enough at this size; can add build orchestration later if the workspace
count grows.

- `client` — React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- `server` — Node + Express + TypeScript + Prisma
- `shared` — Zod schemas and TS types shared between client and server

## Getting started

```bash
npm install
```

Copy `server/.env.example` to `server/.env` and fill in a Postgres connection string.

```bash
npm run dev:server
npm run dev:client
```

## Build order

Following the plan in order: schema → auth → business registration/logo →
customer & item CRUD → document engine (invoice first) → PDF rendering →
remaining document types → proforma-to-invoice conversion → document list/search →
polish pass. See `docs/superpowers/specs/` for the design docs behind each stage.
