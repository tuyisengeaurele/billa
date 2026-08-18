# Billa — Client App Shell (Stage 5a)

Date: 2026-08-18

## Scope

Pure plumbing: routing, an API client, and session/auth state. No real
screens — routes are bare stubs. This unblocks login/register (5b) and the
business onboarding wizard (5c), both of which need this infrastructure to
exist first. No visual/design decisions in this stage.

## Client test infrastructure

The client workspace has had zero test setup since the original scaffold.
Adding Vitest + jsdom + React Testing Library now, matching the rigor
already applied server-side — the API client and auth context are exactly
the kind of logic (fetch mocking, state transitions) that benefits from it,
and getting it in place now means every future client stage inherits it
rather than retrofitting later.

## API client

`client/src/lib/apiClient.ts` — a thin fetch wrapper:
- Always sends `credentials: 'include'` (required since auth uses httpOnly
  cookies, not a bearer token the client can attach manually).
- Base URL from `VITE_API_URL`, defaulting to `http://localhost:4000` in dev.
- Throws a typed `ApiError` (status + parsed body) on any non-2xx response.
- **Transparent refresh-on-401**: for any request that isn't itself
  `/auth/login` or `/auth/refresh`, a 401 triggers one `POST /auth/refresh`
  call; on success the original request is retried once; on failure the 401
  propagates as-is. This is built now for the same reason `requireAuth` was
  built on day one of the auth backend stage — every screen built after this
  one calls the API through this client, so getting the refresh behavior
  right here means no future screen has to think about it.

## Auth context

`client/src/context/AuthContext.tsx` — on mount, calls `GET /auth/me` to
bootstrap session state (`user`, `business`, `isLoading`). Exposes
`login`, `register`, and `logout` methods that call the corresponding auth
endpoints through `apiClient` and update context state on success.

## Routing

`react-router-dom` (already installed, unused until now). A `ProtectedRoute`
wrapper component:
- Renders nothing while `AuthContext`'s initial session bootstrap is loading
  (avoids a flash-redirect to `/login` before we actually know the session
  state).
- Redirects to `/login` if the bootstrap resolves unauthenticated.
- Renders the wrapped route otherwise.

Routes in this stage: `/login`, `/register`, `/onboarding` — all bare stub
components (a heading, nothing else). Real screens land in stages 5b/5c.

## Not covered here

Actual login/register UI, the onboarding wizard, any animation or design
system work. Those are separate stages.
