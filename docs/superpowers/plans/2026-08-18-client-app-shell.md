# Client App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Routing, an API client with transparent session-refresh, and auth context — pure plumbing that login/register (5b) and the onboarding wizard (5c) both build on.

**Architecture:** `apiClient` is a thin fetch wrapper handling cookies, JSON, error typing, and 401-refresh-retry. `AuthContext` bootstraps session state via `GET /auth/me` on mount and exposes login/register/logout. `ProtectedRoute` gates routes on that context. All new client logic is TDD'd with the client workspace's first-ever test setup (Vitest + jsdom + React Testing Library).

**Tech Stack:** react-router-dom (already installed, unused until now), Vitest + jsdom + @testing-library/react (new, client-side test infra).

**Note on import style:** the client workspace's existing files (`main.tsx`, `App.tsx`) import without `.js` extensions (Vite/Bundler resolution, unlike the server's NodeNext). All new client files in this plan follow that same extension-less convention — do not add `.js` suffixes to client-side relative imports.

---

### Task 1: Client test infrastructure

**Files:**
- Modify: `client/package.json`
- Create: `client/vitest.config.ts`
- Create: `client/src/test/setup.ts`

- [ ] **Step 1: Add dependencies**

Edit `client/package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Add to `"devDependencies"`:

```json
"@testing-library/jest-dom": "^6.5.0",
"@testing-library/react": "^16.0.1",
"jsdom": "^25.0.0",
"vitest": "^2.0.5"
```

- [ ] **Step 2: Install**

Run: `npm install --workspace=client`

- [ ] **Step 3: Create the test setup file**

`client/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Create vitest config**

`client/vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 5: Verify the runner works with zero tests**

Run: `npm run test --workspace=client`
Expected: `No test files found` (not an error) — confirms vitest boots with
the jsdom environment and plugin config without crashing.

- [ ] **Step 6: Commit**

```bash
git add client/package.json package-lock.json client/vitest.config.ts client/src/test/setup.ts
git commit -m "add vitest + jsdom + react testing library to client workspace"
```

---

### Task 2: API client with refresh-retry

**Files:**
- Create: `client/.env.example`
- Create: `client/src/lib/apiClient.ts`
- Test: `client/src/lib/apiClient.test.ts`

- [ ] **Step 1: Add the env var example**

`client/.env.example`:

```
VITE_API_URL="http://localhost:4000"
```

No `.gitignore` change needed — the root `.gitignore`'s `.env` entry has no
leading slash, so it already matches `client/.env` at any directory level,
same as it already covers `server/.env`. This step doesn't create an actual
`client/.env` since the code's fallback (`http://localhost:4000`) already
matches the dev default.

- [ ] **Step 2: Write the failing test**

`client/src/lib/apiClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient";

describe("apiRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await apiRequest<{ ok: boolean }>("/health");
    expect(result).toEqual({ ok: true });
  });

  it("sends credentials: include on every request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await apiRequest("/health");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws ApiError with status and body when refresh also fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 }),
    );

    await expect(apiRequest("/business")).rejects.toMatchObject({
      status: 401,
      body: { error: "invalid_credentials" },
    });
  });

  it("retries the original request once after a successful refresh", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ retried: true }), { status: 200 }));

    const result = await apiRequest<{ retried: boolean }>("/business");

    expect(result).toEqual({ retried: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not attempt refresh when the failing request is /auth/login", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 }),
    );

    await expect(apiRequest("/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=client -- apiClient.test.ts`
Expected: FAIL — `./apiClient` doesn't exist

- [ ] **Step 4: Implement**

`client/src/lib/apiClient.ts`:

```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshResponse = await rawRequest("/auth/refresh", { method: "POST" });
    if (refreshResponse.ok) {
      response = await rawRequest(path, options);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseBody(response));
  }

  return (await parseBody(response)) as T;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=client -- apiClient.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add client/.env.example client/src/lib/apiClient.ts client/src/lib/apiClient.test.ts
git commit -m "add api client with transparent session refresh"
```

---

### Task 3: Auth context

**Files:**
- Create: `client/src/context/AuthContext.tsx`
- Test: `client/src/context/AuthContext.test.tsx`

- [ ] **Step 1: Write the failing test**

`client/src/context/AuthContext.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function TestConsumer() {
  const { user, business, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  if (!user) return <div>unauthenticated</div>;
  return (
    <div>
      authenticated as {user.email} ({business?.name})
    </div>
  );
}

describe("AuthProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading, then unauthenticated when /auth/me returns 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("unauthenticated")).toBeInTheDocument());
  });

  it("shows authenticated state when /auth/me succeeds", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("authenticated as owner@example.com (Kigali Traders)")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- AuthContext.test.tsx`
Expected: FAIL — `./AuthContext` doesn't exist

- [ ] **Step 3: Implement**

`client/src/context/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/apiClient";

interface User {
  id: string;
  email: string;
}

interface Business {
  id: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, businessName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ user: User; business: Business }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setBusiness(data.business);
      })
      .catch(() => {
        setUser(null);
        setBusiness(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiRequest<{ user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(data.user);
    const me = await apiRequest<{ business: Business }>("/auth/me");
    setBusiness(me.business);
  }

  async function register(email: string, password: string, businessName: string) {
    const data = await apiRequest<{ user: User; business: Business }>("/auth/register", {
      method: "POST",
      body: { email, password, businessName },
    });
    setUser(data.user);
    setBusiness(data.business);
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
    setBusiness(null);
  }

  return (
    <AuthContext.Provider value={{ user, business, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- AuthContext.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/context/AuthContext.tsx client/src/context/AuthContext.test.tsx
git commit -m "add auth context with session bootstrap"
```

---

### Task 4: ProtectedRoute

**Files:**
- Create: `client/src/components/ProtectedRoute.tsx`
- Test: `client/src/components/ProtectedRoute.test.tsx`

- [ ] **Step 1: Write the failing test**

`client/src/components/ProtectedRoute.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";

function renderWithProviders(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>dashboard page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    renderWithProviders("/dashboard");

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });

  it("renders the protected route when authenticated", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/dashboard");

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- ProtectedRoute.test.tsx`
Expected: FAIL — `./ProtectedRoute` doesn't exist

- [ ] **Step 3: Implement**

`client/src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- ProtectedRoute.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ProtectedRoute.tsx client/src/components/ProtectedRoute.test.tsx
git commit -m "add ProtectedRoute"
```

---

### Task 5: Stub pages, router wiring, and manual browser verification

**Files:**
- Create: `client/src/pages/Login.tsx`
- Create: `client/src/pages/Register.tsx`
- Create: `client/src/pages/Onboarding.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the stub pages**

`client/src/pages/Login.tsx`:

```tsx
export default function Login() {
  return <div>Login</div>;
}
```

`client/src/pages/Register.tsx`:

```tsx
export default function Register() {
  return <div>Register</div>;
}
```

`client/src/pages/Onboarding.tsx`:

```tsx
export default function Onboarding() {
  return <div>Onboarding</div>;
}
```

- [ ] **Step 2: Wire up the router**

Replace the full contents of `client/src/App.tsx` (currently the
"Billa — scaffold running." placeholder from the repo-scaffold stage — this
is the expected point where that placeholder gets replaced) with:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
          </Route>
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Run the full client test suite**

Run: `npm run test --workspace=client`
Expected: all tests PASS (apiClient, AuthContext, ProtectedRoute)

- [ ] **Step 4: Typecheck all workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors

- [ ] **Step 5: Manual verification in a real browser**

Start the server (`npm run dev:server`) and the client (`npm run dev:client`
or via the preview tool), then in the browser:

1. Navigate to `http://localhost:5173/` — expect a redirect to `/login`
   (no session cookie yet, `ProtectedRoute` sends `/onboarding` → `/login`).
2. Navigate to `http://localhost:5173/login` directly — expect to see the
   literal text "Login" (the stub page renders, not a redirect loop).
3. Check the browser's network tab / console — expect a `GET` request to
   `http://localhost:4000/auth/me` on page load returning 401, and no
   unhandled errors in the console from that expected 401.

Expected: no infinite redirect loops, no console errors beyond the expected
401 network response, stub pages render their placeholder text correctly.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Login.tsx client/src/pages/Register.tsx client/src/pages/Onboarding.tsx client/src/App.tsx
git commit -m "wire up client router with stub pages"
```
