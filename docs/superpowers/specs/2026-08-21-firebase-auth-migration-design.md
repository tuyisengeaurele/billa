# Billa: Firebase Auth Migration (Stage 13)

Date: 2026-08-21

## Scope

Replace the hand-rolled email/password auth (bcrypt hashing, our own register/login endpoints) with Firebase Auth for credential handling, while keeping our own session layer (access/refresh cookies, `requireAuth` middleware) completely unchanged for everything downstream of login. Providers at launch: Google and email/password. No real users exist yet, so this is a clean cutover, not a data migration.

## Architecture

Firebase Auth handles credentials entirely client-side: Google OAuth, email/password sign-up and sign-in, password reset emails, email verification emails. The client never sends a password to our server. Instead, once Firebase authenticates a user, the client sends our server the one thing it produces: a Firebase ID token, to a new endpoint `POST /auth/session`.

The server verifies that token with the Firebase Admin SDK, resolves it to a `User`/`Business`, and then mints our own existing access/refresh cookie session exactly as `issueSession()` does today. Every route after that point, `requireAuth`, and all business logic are untouched. This is the key property that keeps the migration scoped: only the front door changes.

## Schema

`User` model changes:

```prisma
model User {
  id          String   @id @default(cuid())
  businessId  String
  email       String   @unique
  firebaseUid String   @unique
  name        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  business      Business       @relation(fields: [businessId], references: [id])
  refreshTokens RefreshToken[]

  @@index([businessId])
}
```

`passwordHash` is removed, along with the bcrypt hashing code path (`server/src/lib/password.ts` and its test). Since there's no real user data to preserve, the local dev database gets reset (`prisma migrate reset`) as part of applying this migration rather than writing a data-preserving migration.

## Server

`shared/src/auth-schemas.ts`: `registerSchema` and `loginSchema` are replaced with a single `sessionSchema`:

```ts
export const sessionSchema = z.object({
  idToken: z.string().trim().min(1, "Missing ID token"),
  businessName: z.string().trim().min(1).optional(),
});
```

New `server/src/lib/firebase-admin.ts`: initializes the Firebase Admin SDK once (service account credentials from `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` env vars) and exports:

```ts
export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string }>
```

`server/src/routes/auth.ts`: `POST /register` and `POST /login` are removed. New `POST /session` (behind the existing `authRateLimit` middleware):

1. Verify `idToken` via `verifyFirebaseToken`. A verification failure returns 401.
2. Look up `User` by `firebaseUid`.
   - **Found** → this is a sign-in. Issue a session for that user, same as today's login response.
   - **Not found, `businessName` provided** → this is a sign-up. Create `Business` + `User` (with the verified `email`/`uid`) in one transaction, same shape as today's register, then issue a session.
   - **Not found, no `businessName`** → return 404 `{ error: "no_account" }` so the client can route to sign-up instead of silently creating an empty business (this is the "clicked Sign in with Google but never signed up" case).

`GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout` are unchanged; they only ever operated on our own session cookies.

## Client

New dependency: `firebase` (client SDK). New `client/src/lib/firebase.ts`:

```ts
export const auth: Auth; // getAuth(initializeApp(config))
export const googleProvider: GoogleAuthProvider;
```

Config values (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) come from `.env`; these are public web config, not secrets.

`Login.tsx`: email/password fields now call Firebase's `signInWithEmailAndPassword`, then exchange the resulting ID token via `/auth/session`. A "Sign in with Google" button calls `signInWithPopup(auth, googleProvider)` and does the same exchange. A "Forgot password?" link calls Firebase's `sendPasswordResetEmail` directly, with no server involvement needed. This closes the password-reset gap identified in the earlier functionality audit at no extra cost.

`Register.tsx`: same shape, using `createUserWithEmailAndPassword` (or the Google button) plus the collected business name, exchanged via `/auth/session` with `businessName` included.

`AuthContext.tsx` keeps its exact public shape (`user`, `business`, `isLoading`, `login`, `register`, `logout`) so nothing else in the app changes. Internally, `login`/`register` perform the Firebase call plus the `/auth/session` exchange instead of posting credentials directly. `logout()` calls Firebase's `signOut(auth)` in addition to the existing `POST /auth/logout` call that revokes the refresh token.

Firebase errors (wrong password, email already in use, popup closed by user, etc.) map to the existing inline error-banner pattern already used on these pages, with a generic fallback message for anything unrecognized.

## Testing

The real cost center: 21 server test files currently obtain a session by registering with a plain password. Rather than touch each file's mocking setup individually, `server/src/test/setup.ts` (already loaded globally via `vitest.config.ts`'s `setupFiles`) gets a single global mock of `verifyFirebaseToken` that decodes a fake token format instead of calling real Firebase:

```ts
vi.mock("../lib/firebase-admin.js", () => ({
  verifyFirebaseToken: async (idToken: string) => JSON.parse(idToken),
}));
```

Each of the 21 files' `registerAndGetCookies`-style helper changes from posting `{ email, password, businessName }` to `/auth/register`, to posting `{ idToken: JSON.stringify({ uid: "<unique-per-test>", email }), businessName }` to `/auth/session`. The helper's signature and return value (a cookie array) don't change, so the rest of each test file is untouched. This keeps every test fully offline, with no real network calls and no Firebase emulator needed.

New tests specifically for the auth flow (in a rewritten `server/src/routes/auth.test.ts` or split `auth.session.test.ts`): sign-up creates a business and user, sign-in on a second call with the same `uid` returns the same user without creating a duplicate, sign-in without a matching account and no `businessName` returns 404 `no_account`, an invalid/unverifiable token returns 401.

Client-side: `Login.test.tsx` and `Register.test.tsx` mock the `firebase/auth` module's functions (`signInWithEmailAndPassword`, `signInWithPopup`, etc.) the same way they already mock `fetch`, so no real Firebase project is needed for client tests either.

## Firebase project setup

This needs a Firebase project, which only you can create (it requires your Google account in the Firebase console). Once we're ready to verify against a real project, you'll need to:

1. Create a Firebase project for Billa.
2. Enable the Google and Email/Password sign-in providers under Authentication.
3. Register a Web App to get the client config values.
4. Generate a service account key (Project Settings → Service Accounts) for the server's Admin SDK credentials.

Everything up to real-browser verification can be built and fully tested against the mocked token verification described above. Only the final end-to-end check needs a real project.

## Not covered here

Billing (the next stage, which will key subscriptions off `Business` using the stable identity this migration establishes), "log out of all devices" (straightforward to add later via `admin.auth().revokeRefreshTokens(uid)`, not needed for this cutover), requiring email verification before granting access, and any provider beyond Google and email/password.
