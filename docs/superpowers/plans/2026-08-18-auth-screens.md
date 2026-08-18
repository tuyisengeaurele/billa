# Login & Register Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real, polished `/login` and `/register` screens wired to the existing auth backend and app shell — the first visual UI in the project.

**Architecture:** A shared `AuthLayout` (split-screen, brand panel + form panel) wraps both pages. `FormField` and `Button` are small reusable primitives with their own light test coverage. `Login`/`Register` use `react-hook-form` + the Zod resolver against the existing `@billa/shared` schemas, calling `AuthContext`'s `login`/`register` methods. Functional behavior (validation, submit, error handling, navigation) is TDD'd with React Testing Library; purely visual/motion details (the brand panel's texture, animation timing) are implementation craft verified by eye in the browser at the end, not asserted in tests — matching how much rigor each kind of code actually needs.

**Tech Stack:** `react-hook-form`, `@hookform/resolvers` (new), `@fontsource-variable/fraunces` + `@fontsource-variable/plus-jakarta-sans` (new, self-hosted fonts), `@testing-library/user-event` (new, for simulating form input). `framer-motion` already installed and unused until now.

---

### Task 1: Fonts and Tailwind typography tokens

**Files:**
- Modify: `client/package.json`
- Modify: `client/src/main.tsx`
- Modify: `client/tailwind.config.ts`

- [ ] **Step 1: Add font packages**

Edit `client/package.json`, add to `"dependencies"`:

```json
"@fontsource-variable/fraunces": "^5.1.1",
"@fontsource-variable/plus-jakarta-sans": "^5.1.1"
```

Run: `npm install --workspace=client`

- [ ] **Step 2: Import the fonts**

Edit `client/src/main.tsx`, add before the existing `import "./index.css";` line:

```tsx
import "@fontsource-variable/fraunces";
import "@fontsource-variable/plus-jakarta-sans";
```

- [ ] **Step 3: Register font families in Tailwind**

Edit `client/tailwind.config.ts`, inside `theme.extend`, add a `fontFamily` key alongside the existing `colors` key:

```ts
fontFamily: {
  display: ["Fraunces Variable", "ui-serif", "serif"],
  sans: ["Plus Jakarta Sans Variable", "ui-sans-serif", "sans-serif"],
},
```

- [ ] **Step 4: Verify the fonts actually loaded (don't assume the registered family name)**

Run: `npm run dev:client`, open the preview, and in the browser devtools console run:

```js
document.fonts.check("16px 'Fraunces Variable'")
document.fonts.check("16px 'Plus Jakarta Sans Variable'")
```

Expected: both return `true`. If either returns `false`, open
`node_modules/@fontsource-variable/<package>/index.css` and check the actual
`font-family` name declared there — use that exact string in
`tailwind.config.ts` instead of assuming "Fraunces Variable" /
"Plus Jakarta Sans Variable" are correct.

- [ ] **Step 5: Commit**

```bash
git add client/package.json package-lock.json client/src/main.tsx client/tailwind.config.ts
git commit -m "add self-hosted fonts and typography tokens"
```

---

### Task 2: Shared form primitives — FormField and Button

**Files:**
- Modify: `client/package.json`
- Create: `client/src/components/FormField.tsx`
- Test: `client/src/components/FormField.test.tsx`
- Create: `client/src/components/Button.tsx`
- Test: `client/src/components/Button.test.tsx`

- [ ] **Step 1: Add user-event for simulating form interaction**

Edit `client/package.json`, add to `"devDependencies"`:

```json
"@testing-library/user-event": "^14.5.2"
```

Run: `npm install --workspace=client`

- [ ] **Step 2: Write the failing FormField test**

`client/src/components/FormField.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "./FormField";

describe("FormField", () => {
  it("associates the label with the input via id", () => {
    render(<FormField id="email" label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows the error message and marks the input invalid", () => {
    render(<FormField id="email" label="Email" error="Invalid email" />);
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not mark the input invalid when there is no error", () => {
    render(<FormField id="email" label="Email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=client -- FormField.test.tsx`
Expected: FAIL — `./FormField` doesn't exist

- [ ] **Step 4: Implement FormField**

`client/src/components/FormField.tsx`:

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, id, ...inputProps },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={`rounded-lg border px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
          error ? "border-error" : "border-neutral-200"
        }`}
        aria-invalid={error ? "true" : "false"}
        {...inputProps}
      />
      {error && (
        <p className="font-sans text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=client -- FormField.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing Button test**

`client/src/components/Button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children when not loading", () => {
    render(<Button>Log in</Button>);
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("hides children and disables the button while loading", () => {
    render(<Button isLoading>Log in</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.queryByText("Log in")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm run test --workspace=client -- Button.test.tsx`
Expected: FAIL — `./Button` doesn't exist

- [ ] **Step 8: Implement Button**

`client/src/components/Button.tsx`:

```tsx
import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  children: ReactNode;
}

export function Button({ isLoading, children, disabled, className, ...props }: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      whileHover={{ scale: isDisabled ? 1 : 1.01 }}
      whileTap={{ scale: isDisabled ? 1 : 0.98 }}
      disabled={isDisabled}
      className={`flex w-full items-center justify-center rounded-lg bg-primary-500 px-4 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70 ${className ?? ""}`}
      {...props}
    >
      {isLoading ? (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
          className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </motion.button>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm run test --workspace=client -- Button.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add client/package.json package-lock.json client/src/components/FormField.tsx client/src/components/FormField.test.tsx client/src/components/Button.tsx client/src/components/Button.test.tsx
git commit -m "add FormField and Button primitives"
```

---

### Task 3: AuthLayout

**Files:**
- Create: `client/src/components/AuthLayout.tsx`

No dedicated test file — this component is purely structural/visual (renders
a brand panel and a form panel, no conditional logic), verified by eye in
Task 6's manual browser check rather than asserted in a test.

- [ ] **Step 1: Implement**

`client/src/components/AuthLayout.tsx`:

```tsx
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  eyebrow: string;
  headline: string;
  tagline: string;
  children: ReactNode;
}

export function AuthLayout({ eyebrow, headline, tagline, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 overflow-hidden bg-primary-500 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25) 0, transparent 45%)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 font-display text-2xl font-semibold text-white"
        >
          Billa
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="relative z-10"
        >
          <p className="font-sans text-sm uppercase tracking-[0.2em] text-primary-100">{eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-white">{headline}</h1>
          <p className="mt-4 max-w-sm font-sans text-base text-primary-100">{tagline}</p>
        </motion.div>
      </div>
      <div className="flex w-full flex-col justify-center bg-white px-6 py-12 lg:w-1/2 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/AuthLayout.tsx
git commit -m "add AuthLayout split-screen shell"
```

---

### Task 4: Login page

**Files:**
- Modify: `client/package.json`
- Modify (replace stub): `client/src/pages/Login.tsx`
- Test: `client/src/pages/Login.test.tsx`

- [ ] **Step 1: Add form dependencies**

Edit `client/package.json`, add to `"dependencies"`:

```json
"@hookform/resolvers": "^3.9.0",
"react-hook-form": "^7.53.0"
```

Run: `npm install --workspace=client`

- [ ] **Step 2: Write the failing test**

`client/src/pages/Login.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Login from "./Login";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("Login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the email field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true"));
  });

  it("navigates to /onboarding after a successful login", async () => {
    // /auth/me is called twice: once by AuthProvider's bootstrap (must be
    // 401, unauthenticated), once by login() itself right after a
    // successful /auth/login to fetch the business (must succeed) — a
    // call counter distinguishes the two.
    let authMeCalls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        authMeCalls += 1;
        if (authMeCalls === 1) return new Response("{}", { status: 401 });
        return new Response(JSON.stringify({ business: { id: "b1", name: "Kigali Traders" } }), {
          status: 200,
        });
      }
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ user: { id: "u1", email: "owner@example.com" } }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner on invalid credentials", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/doesn't match our records/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=client -- Login.test.tsx`
Expected: FAIL — the stub `Login` from stage 5a has no form, none of the
queries (`getByLabelText`, the button role) find anything

- [ ] **Step 4: Implement**

Replace the full contents of `client/src/pages/Login.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setApiError(null);
    try {
      await login(data.email, data.password);
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setApiError("That email or password doesn't match our records.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      headline="Run your business on paper that means business."
      tagline="Invoices, quotes, and receipts your customers actually trust."
    >
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Log in</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        New to Billa?{" "}
        <Link to="/register" className="font-medium text-primary-500 hover:text-primary-700">
          Create an account
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=client -- Login.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add client/package.json package-lock.json client/src/pages/Login.tsx client/src/pages/Login.test.tsx
git commit -m "implement login screen"
```

---

### Task 5: Register page

**Files:**
- Modify (replace stub): `client/src/pages/Register.tsx`
- Test: `client/src/pages/Register.test.tsx`

- [ ] **Step 1: Write the failing test**

`client/src/pages/Register.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Register from "./Register";

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("Register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the business name field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/business name/i)).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("navigates to /onboarding after a successful registration", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/register")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "supersecret1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner when the email is already taken", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/register")) {
        return new Response(JSON.stringify({ error: "email_taken" }), { status: 409 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "supersecret1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- Register.test.tsx`
Expected: FAIL — the stub `Register` from stage 5a has no form

- [ ] **Step 3: Implement**

Replace the full contents of `client/src/pages/Register.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

export default function Register() {
  const { register: registerBusiness } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterInput) {
    setApiError(null);
    try {
      await registerBusiness(data.email, data.password, data.businessName);
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setApiError("That email is already registered. Try logging in instead.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      headline="Your first professional invoice is minutes away."
      tagline="Set up your business once, generate documents forever."
    >
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Create your account</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        Already have one?{" "}
        <Link to="/login" className="font-medium text-primary-500 hover:text-primary-700">
          Log in
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        <FormField
          id="businessName"
          label="Business name"
          type="text"
          autoComplete="organization"
          error={errors.businessName?.message}
          {...register("businessName")}
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- Register.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Register.tsx client/src/pages/Register.test.tsx
git commit -m "implement register screen"
```

---

### Task 6: Full suite check, typecheck, and real browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full client test suite**

Run: `npm run test --workspace=client`
Expected: all tests PASS, including every file from stage 5a plus this
stage's new files

- [ ] **Step 2: Typecheck all workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors

- [ ] **Step 3: Real browser verification against the live server**

Start both `npm run dev:server` and the client preview. With the dev
database in a state where you can create a fresh account (or reuse one from
an earlier smoke test):

1. Navigate to `/register`. Confirm: the split-screen layout renders with
   the brand panel on the left (raspberry background, "Billa" wordmark,
   headline, tagline) and the form on the right; both fonts are visibly
   distinct from a generic sans-everywhere look.
2. Submit with all fields empty — confirm inline validation errors appear
   under each field, no page reload, no console errors.
3. Fill in a new business name/email/password and submit — confirm the
   button shows its loading state briefly, then the browser navigates to
   `/onboarding` (which will show the stub "Onboarding" text from stage 5a).
4. Log out is not built yet, so to test `/login`: navigate to `/login`
   directly, submit with the credentials just created — confirm it also
   navigates to `/onboarding`.
5. Try `/login` with a wrong password — confirm the red error banner
   appears with the "doesn't match our records" message.
6. Try `/register` with the same email again — confirm the "already
   registered" banner appears.
7. Resize the browser to a narrow (mobile) width — confirm the layout
   collapses to a single column (the brand panel is `hidden` below the `lg`
   breakpoint per `AuthLayout`) rather than clipping or overlapping.

Expected: no console errors beyond the intentional 401s from invalid-login
attempts, no layout breakage at narrow widths, all three interaction paths
(validation, success, API error) behave as designed.

- [ ] **Step 4: Final commit if any cleanup was needed**

If step 3 surfaced any fixes, commit them:

```bash
git add -A
git commit -m "fix issues found in auth screens browser verification"
```

If nothing needed fixing, skip this step.
