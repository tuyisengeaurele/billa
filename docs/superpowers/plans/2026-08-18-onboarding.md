# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two-step onboarding wizard (business details, then logo/brand) that runs right after registration, wiring up the already-built backend endpoints, plus a minimal Dashboard stub as the landing spot.

**Architecture:** `Onboarding.tsx` owns `step: "details" | "logo"` and renders one of two extracted step components (`DetailsStep`, `LogoStep`) inside a new `OnboardingLayout` shell. Each step calls the existing `/business` and `/business/logo/*` endpoints directly via `apiRequest` and reports completion via an `onComplete` callback; `Onboarding.tsx` decides what completion means (advance to the next step, or navigate to `/dashboard`).

**Tech Stack:** React 18, react-hook-form + zod (client-local schema, not the shared one), Tailwind, framer-motion, Vitest + React Testing Library — all already in place, no new dependencies.

**Reference:** `docs/superpowers/specs/2026-08-18-onboarding-design.md`

---

## File Structure

- Modify: `client/src/lib/apiClient.ts` — add FormData body support (needed for the logo upload's multipart POST) and export `API_BASE_URL` (needed to build absolute `<img src>` URLs for uploaded logos, since they're relative paths served by Express, not Vite).
- Create: `client/src/components/onboarding/OnboardingLayout.tsx` — shared wizard shell: step label, "Skip onboarding" link, card container.
- Create: `client/src/components/onboarding/DetailsStep.tsx` — business details form.
- Create: `client/src/components/onboarding/LogoStep.tsx` — logo upload → background removal → color extraction → review/confirm.
- Modify: `client/src/pages/Onboarding.tsx` — orchestrates the two steps.
- Create: `client/src/pages/Dashboard.tsx` — minimal landing stub.
- Modify: `client/src/App.tsx` — add the `/dashboard` route.

Each new component gets its own colocated `.test.tsx` file, matching the existing pattern (`FormField.tsx` / `FormField.test.tsx`, etc).

---

### Task 1: apiClient FormData support + API_BASE_URL export

**Files:**
- Modify: `client/src/lib/apiClient.ts`
- Test: `client/src/lib/apiClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `client/src/lib/apiClient.test.ts`, inside the existing `describe("apiRequest", ...)` block:

```ts
  it("sends FormData bodies as-is, without a Content-Type header or JSON stringification", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const formData = new FormData();
    formData.append("logo", new Blob(["fake-bytes"], { type: "image/png" }), "logo.png");

    await apiRequest("/business/logo", { method: "POST", body: formData });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.body).toBe(formData);
    expect(init?.headers).toBeUndefined();
  });
```

At the bottom of the file, add a new describe block:

```ts
import { API_BASE_URL } from "./apiClient";

describe("API_BASE_URL", () => {
  it("is a non-empty string", () => {
    expect(typeof API_BASE_URL).toBe("string");
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });
});
```

(Add that import alongside the existing `import { ApiError, apiRequest } from "./apiClient";` line at the top instead of a second import statement.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- apiClient.test.ts`
Expected: FAIL — `API_BASE_URL` is not exported, and the FormData test fails because the body gets `JSON.stringify`'d into a broken value and a `Content-Type: application/json` header gets sent.

- [ ] **Step 3: Implement**

Replace the top of `client/src/lib/apiClient.ts`:

```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const API_BASE_URL = BASE_URL;
```

Replace `rawRequest`:

```ts
async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const { body } = options;
  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- apiClient.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/apiClient.ts client/src/lib/apiClient.test.ts
git commit -m "support FormData bodies in apiClient, export API_BASE_URL"
```

---

### Task 2: OnboardingLayout

**Files:**
- Create: `client/src/components/onboarding/OnboardingLayout.tsx`
- Test: `client/src/components/onboarding/OnboardingLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingLayout } from "./OnboardingLayout";

describe("OnboardingLayout", () => {
  it("renders the step label and children", () => {
    render(
      <OnboardingLayout stepLabel="Step 1 of 2" onSkipAll={() => {}}>
        <p>step content</p>
      </OnboardingLayout>,
    );
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("step content")).toBeInTheDocument();
  });

  it("calls onSkipAll when the skip link is clicked", async () => {
    const onSkipAll = vi.fn();
    const user = userEvent.setup();
    render(
      <OnboardingLayout stepLabel="Step 1 of 2" onSkipAll={onSkipAll}>
        <p>content</p>
      </OnboardingLayout>,
    );
    await user.click(screen.getByRole("button", { name: /skip onboarding/i }));
    expect(onSkipAll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- OnboardingLayout.test.tsx`
Expected: FAIL — `./OnboardingLayout` does not exist.

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from "react";

interface OnboardingLayoutProps {
  stepLabel: string;
  onSkipAll: () => void;
  children: ReactNode;
}

export function OnboardingLayout({ stepLabel, onSkipAll, children }: OnboardingLayoutProps) {
  return (
    <div className="flex min-h-screen justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              {stepLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onSkipAll}
            className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
          >
            Skip onboarding
          </button>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- OnboardingLayout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/onboarding/OnboardingLayout.tsx client/src/components/onboarding/OnboardingLayout.test.tsx
git commit -m "add OnboardingLayout wizard shell"
```

---

### Task 3: DetailsStep

**Files:**
- Create: `client/src/components/onboarding/DetailsStep.tsx`
- Test: `client/src/components/onboarding/DetailsStep.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailsStep } from "./DetailsStep";

describe("DetailsStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all six business detail fields", () => {
    render(<DetailsStep onComplete={() => {}} />);
    expect(screen.getByLabelText("TIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Industry")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Business email")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.getByLabelText("RRA EBM number")).toBeInTheDocument();
  });

  it("calls onComplete without a network request when Skip is clicked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls onComplete without a network request when Continue is clicked with everything blank", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends only the filled-in fields on Continue", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep onComplete={onComplete} />);

    await user.type(screen.getByLabelText("TIN"), "123456789");
    await user.type(screen.getByLabelText("Phone"), "+250788000000");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ tin: "123456789", phone: "+250788000000" });
  });

  it("shows a validation error for an invalid business email and does not submit", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep onComplete={onComplete} />);

    await user.type(screen.getByLabelText("Business email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/enter a valid business email/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows an error banner and does not advance when the save fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep onComplete={onComplete} />);

    await user.type(screen.getByLabelText("TIN"), "123456789");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/couldn't save those details/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- DetailsStep.test.tsx`
Expected: FAIL — `./DetailsStep` does not exist.

- [ ] **Step 3: Implement**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { apiRequest, ApiError } from "../../lib/apiClient";

const detailsFormSchema = z.object({
  tin: z.string().trim(),
  industry: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid business email")]),
  address: z.string().trim(),
  rraEbmNumber: z.string().trim(),
});
type DetailsFormInput = z.infer<typeof detailsFormSchema>;

const FIELDS: { id: keyof DetailsFormInput; label: string; type: "text" | "tel" | "email" }[] = [
  { id: "tin", label: "TIN", type: "text" },
  { id: "industry", label: "Industry", type: "text" },
  { id: "phone", label: "Phone", type: "tel" },
  { id: "email", label: "Business email", type: "email" },
  { id: "address", label: "Address", type: "text" },
  { id: "rraEbmNumber", label: "RRA EBM number", type: "text" },
];

interface DetailsStepProps {
  onComplete: () => void;
}

export function DetailsStep({ onComplete }: DetailsStepProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DetailsFormInput>({ resolver: zodResolver(detailsFormSchema) });

  async function onSubmit(data: DetailsFormInput) {
    setApiError(null);
    const payload: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = data[field.id].trim();
      if (value.length > 0) {
        payload[field.id] = value;
      }
    }

    if (Object.keys(payload).length === 0) {
      onComplete();
      return;
    }

    try {
      await apiRequest("/business", { method: "PATCH", body: payload });
      onComplete();
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError("Couldn't save those details. Try again.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Tell us about your business</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        All optional — fill in what you have, skip what you don't.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        {FIELDS.map((field) => (
          <FormField
            key={field.id}
            id={field.id}
            label={field.label}
            type={field.type}
            error={errors[field.id]?.message}
            {...register(field.id)}
          />
        ))}
        <Button type="submit" isLoading={isSubmitting}>
          Continue
        </Button>
        <button
          type="button"
          onClick={onComplete}
          className="self-center font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
        >
          Skip this step
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- DetailsStep.test.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/onboarding/DetailsStep.tsx client/src/components/onboarding/DetailsStep.test.tsx
git commit -m "add onboarding business details step"
```

---

### Task 4: LogoStep

**Files:**
- Create: `client/src/components/onboarding/LogoStep.tsx`
- Test: `client/src/components/onboarding/LogoStep.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogoStep } from "./LogoStep";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockSuccessfulPipeline() {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/business/logo")) {
      return new Response(JSON.stringify({ url: "/uploads/b1/logo.png" }), { status: 201 });
    }
    if (url.endsWith("/business/logo/remove-background")) {
      return new Response(
        JSON.stringify({ url: "/uploads/b1/logo-nobg.png", backgroundRemoved: true }),
        { status: 200 },
      );
    }
    if (url.endsWith("/business/logo/extract-colors")) {
      return new Response(
        JSON.stringify({ primaryColor: "#C2185B", accentColors: ["#E0F2FE", "#8F1144"], contrastRatio: 4.5 }),
        { status: 200 },
      );
    }
    if (url.endsWith("/business/logo/confirm")) {
      return new Response(JSON.stringify({ business: {} }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

const PNG_FILE = new File(["fake-image-bytes"], "logo.png", { type: "image/png" });

describe("LogoStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the upload prompt and skip link initially", () => {
    render(<LogoStep onComplete={() => {}} />);
    expect(screen.getByLabelText(/click to upload your logo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip this step/i })).toBeInTheDocument();
  });

  it("runs the upload, background removal, and color extraction pipeline after a file is chosen", async () => {
    mockSuccessfulPipeline();
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);

    expect(await screen.findByText(/setting up your logo/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /use these colors/i })).toBeInTheDocument();
    expect(screen.getByText("#C2185B")).toBeInTheDocument();
  });

  it("confirms the logo with the extracted colors and calls onComplete", async () => {
    mockSuccessfulPipeline();
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<LogoStep onComplete={onComplete} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);
    await user.click(await screen.findByRole("button", { name: /use these colors/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("lets you adjust the primary color before confirming", async () => {
    const fetchSpy = mockSuccessfulPipeline();
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);
    await screen.findByRole("button", { name: /use these colors/i });

    await user.click(screen.getByRole("button", { name: /adjust colors/i }));
    const primaryInput = screen.getByLabelText("Primary color");
    fireEvent.change(primaryInput, { target: { value: "#000000" } });
    await user.click(screen.getByRole("button", { name: /use these colors/i }));

    await waitFor(() => {
      const confirmCall = fetchSpy.mock.calls.find((call) => urlOf(call[0]).endsWith("/logo/confirm"));
      expect(confirmCall).toBeDefined();
      expect(JSON.parse(confirmCall![1]?.body as string)).toMatchObject({ primaryColor: "#000000" });
    });
  });

  it("resets to the upload prompt when 'try a different logo' is clicked", async () => {
    mockSuccessfulPipeline();
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);
    await screen.findByRole("button", { name: /use these colors/i });

    await user.click(screen.getByRole("button", { name: /try a different logo/i }));

    expect(screen.getByLabelText(/click to upload your logo/i)).toBeInTheDocument();
  });

  it("calls onComplete without confirming when Skip is clicked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<LogoStep onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows an inline error and returns to upload when the file is rejected", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_file_type" }), { status: 400 }),
    );
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);

    expect(await screen.findByText(/couldn't be used/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/click to upload your logo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- LogoStep.test.tsx`
Expected: FAIL — `./LogoStep` does not exist.

- [ ] **Step 3: Implement**

```tsx
import { motion } from "framer-motion";
import { useState, type ChangeEvent } from "react";
import { Button } from "../Button";
import { API_BASE_URL, apiRequest, ApiError } from "../../lib/apiClient";

interface LogoStepProps {
  onComplete: () => void;
}

type LogoStepState =
  | { phase: "upload" }
  | { phase: "processing" }
  | {
      phase: "review";
      url: string;
      primaryColor: string;
      accentColors: string[];
      contrastRatio: number;
    };

export function LogoStep({ onComplete }: LogoStepProps) {
  const [state, setState] = useState<LogoStepState>({ phase: "upload" });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setApiError(null);
    setState({ phase: "processing" });

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const uploaded = await apiRequest<{ url: string }>("/business/logo", {
        method: "POST",
        body: formData,
      });

      const removed = await apiRequest<{ url: string; backgroundRemoved: boolean }>(
        "/business/logo/remove-background",
        { method: "POST", body: { url: uploaded.url } },
      );

      const palette = await apiRequest<{ primaryColor: string; accentColors: string[]; contrastRatio: number }>(
        "/business/logo/extract-colors",
        { method: "POST", body: { url: removed.url } },
      );

      setState({
        phase: "review",
        url: removed.url,
        primaryColor: palette.primaryColor,
        accentColors: palette.accentColors,
        contrastRatio: palette.contrastRatio,
      });
    } catch (err) {
      setState({ phase: "upload" });
      if (err instanceof ApiError && err.status === 400) {
        setUploadError("That file couldn't be used. Try a PNG, JPEG, or WebP under 5MB.");
      } else {
        setUploadError("Something went wrong uploading that logo. Try again.");
      }
    }
  }

  async function handleConfirm() {
    if (state.phase !== "review") return;
    setApiError(null);
    setIsConfirming(true);
    try {
      await apiRequest("/business/logo/confirm", {
        method: "POST",
        body: { url: state.url, primaryColor: state.primaryColor, accentColors: state.accentColors },
      });
      onComplete();
    } catch {
      setApiError("Couldn't save your logo. Try again.");
      setIsConfirming(false);
    }
  }

  function handleTryDifferentLogo() {
    setState({ phase: "upload" });
    setIsAdjusting(false);
  }

  function updatePrimaryColor(value: string) {
    setState((current) => (current.phase === "review" ? { ...current, primaryColor: value } : current));
  }

  function updateAccentColor(index: number, value: string) {
    setState((current) => {
      if (current.phase !== "review") return current;
      const accentColors = current.accentColors.map((color, i) => (i === index ? value : color));
      return { ...current, accentColors };
    });
  }

  function removeAccentColor(index: number) {
    setState((current) => {
      if (current.phase !== "review") return current;
      return { ...current, accentColors: current.accentColors.filter((_, i) => i !== index) };
    });
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Add your logo</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        We'll remove the background and pick your brand colors automatically.
      </p>

      {apiError && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}

      {state.phase === "upload" && (
        <div className="mt-8">
          <label
            htmlFor="logo-upload"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 px-6 py-12 text-center transition-colors hover:border-primary-500"
          >
            <span className="font-sans text-sm font-medium text-neutral-800">Click to upload your logo</span>
            <span className="mt-1 font-sans text-xs text-neutral-400">PNG, JPEG, or WebP, up to 5MB</span>
          </label>
          <input
            id="logo-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleFileChange}
          />
          {uploadError && (
            <p className="mt-2 font-sans text-sm text-error" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {state.phase === "processing" && (
        <div className="mt-8 flex flex-col items-center justify-center gap-4 py-12">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-2 border-primary-100 border-t-primary-500"
            aria-hidden="true"
          />
          <p className="font-sans text-sm text-neutral-600">Setting up your logo…</p>
        </div>
      )}

      {state.phase === "review" && (
        <div className="mt-8 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <img
                src={`${API_BASE_URL}${state.url}`}
                alt="Your logo on a light background"
                className="h-16 w-16 object-contain"
              />
            </div>
            <div className="flex items-center justify-center rounded-xl bg-primary-500 p-6">
              <img
                src={`${API_BASE_URL}${state.url}`}
                alt="Your logo on your brand color"
                className="h-16 w-16 object-contain"
              />
            </div>
          </div>

          <div>
            <p className="font-sans text-sm font-medium text-neutral-800">Primary color</p>
            <div className="mt-2 flex items-center gap-3">
              {isAdjusting ? (
                <input
                  type="color"
                  aria-label="Primary color"
                  value={state.primaryColor}
                  onChange={(e) => updatePrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-md border border-neutral-200"
                />
              ) : (
                <span
                  aria-label="Primary color"
                  className="h-9 w-9 rounded-md border border-neutral-200"
                  style={{ backgroundColor: state.primaryColor }}
                />
              )}
              <span className="font-sans text-xs text-neutral-400">{state.primaryColor}</span>
            </div>
            <p className="mt-2 font-sans text-xs text-neutral-400">
              Contrast ratio: {state.contrastRatio.toFixed(1)}:1
            </p>

            {state.accentColors.length > 0 && (
              <>
                <p className="mt-4 font-sans text-sm font-medium text-neutral-800">Accent colors</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {state.accentColors.map((color, index) => (
                    <div key={`${color}-${index}`} className="flex items-center gap-1.5">
                      {isAdjusting ? (
                        <input
                          type="color"
                          aria-label={`Accent color ${index + 1}`}
                          value={color}
                          onChange={(e) => updateAccentColor(index, e.target.value)}
                          className="h-9 w-9 cursor-pointer rounded-md border border-neutral-200"
                        />
                      ) : (
                        <span
                          aria-label={`Accent color ${index + 1}`}
                          className="h-9 w-9 rounded-md border border-neutral-200"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {isAdjusting && (
                        <button
                          type="button"
                          onClick={() => removeAccentColor(index)}
                          aria-label={`Remove accent color ${index + 1}`}
                          className="text-neutral-400 hover:text-neutral-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button type="button" isLoading={isConfirming} onClick={handleConfirm}>
              Use these colors
            </Button>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setIsAdjusting((v) => !v)}
                className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
              >
                {isAdjusting ? "Done adjusting" : "Adjust colors"}
              </button>
              <button
                type="button"
                onClick={handleTryDifferentLogo}
                className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
              >
                Try a different logo
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onComplete}
        className="mt-6 font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
      >
        Skip this step
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- LogoStep.test.tsx`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/onboarding/LogoStep.tsx client/src/components/onboarding/LogoStep.test.tsx
git commit -m "add onboarding logo and brand color step"
```

---

### Task 5: Onboarding.tsx orchestrator

**Files:**
- Modify: `client/src/pages/Onboarding.tsx`
- Create: `client/src/pages/Onboarding.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Onboarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts on the business details step", () => {
    renderOnboarding();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/tell us about your business/i)).toBeInTheDocument();
  });

  it("moves to the logo step after the details step completes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByText(/add your logo/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("navigates to the dashboard once the logo step completes", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip this step/i }));
    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });

  it("navigates straight to the dashboard when 'skip onboarding' is clicked", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip onboarding/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- Onboarding.test.tsx`
Expected: FAIL — current `Onboarding.tsx` is a one-line stub with none of this markup.

- [ ] **Step 3: Implement**

Replace `client/src/pages/Onboarding.tsx` entirely:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DetailsStep } from "../components/onboarding/DetailsStep";
import { LogoStep } from "../components/onboarding/LogoStep";
import { OnboardingLayout } from "../components/onboarding/OnboardingLayout";

type Step = "details" | "logo";

export default function Onboarding() {
  const [step, setStep] = useState<Step>("details");
  const navigate = useNavigate();

  function goToDashboard() {
    navigate("/dashboard");
  }

  return (
    <OnboardingLayout stepLabel={step === "details" ? "Step 1 of 2" : "Step 2 of 2"} onSkipAll={goToDashboard}>
      {step === "details" ? (
        <DetailsStep onComplete={() => setStep("logo")} />
      ) : (
        <LogoStep onComplete={goToDashboard} />
      )}
    </OnboardingLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- Onboarding.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Onboarding.tsx client/src/pages/Onboarding.test.tsx
git commit -m "wire up onboarding step orchestration"
```

---

### Task 6: Dashboard stub + route

**Files:**
- Create: `client/src/pages/Dashboard.tsx`
- Create: `client/src/pages/Dashboard.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a welcome message with the business name", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }), {
        status: 200,
      }),
    );

    render(
      <AuthProvider>
        <Dashboard />
      </AuthProvider>,
    );

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- Dashboard.test.tsx`
Expected: FAIL — `./Dashboard` does not exist.

- [ ] **Step 3: Implement**

```tsx
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { business } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-50 px-6 text-center">
      <h1 className="font-display text-3xl font-semibold text-neutral-900">
        Welcome, {business?.name ?? "there"}.
      </h1>
      <p className="font-sans text-sm text-neutral-600">Your Billa workspace is ready.</p>
    </div>
  );
}
```

Modify `client/src/App.tsx` — add the import and route:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- Dashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Dashboard.tsx client/src/pages/Dashboard.test.tsx client/src/App.tsx
git commit -m "add dashboard stub as onboarding's landing page"
```

---

### Task 7: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full client suite**

Run: `npm run test --workspace=client`
Expected: all tests pass (existing 30 + new ones from Tasks 1–6).

- [ ] **Step 2: Typecheck all three workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors in any workspace.

- [ ] **Step 3: Run the shared and server suites for regression safety**

Run:
```bash
npm run test --workspace=shared
npm run test --workspace=server
```
Expected: unchanged, all passing (these workspaces weren't touched by this plan).

- [ ] **Step 4: Real-browser smoke test**

Start the client dev server (and confirm the API server + rembg service used by earlier stages are running, since this step exercises the live logo/background-removal/color-extraction pipeline, not mocks). Using the Browser pane:

1. Register a fresh test account (or reuse a logged-in session) and land on `/onboarding`.
2. Fill in a couple of business detail fields, click Continue — confirm it advances to "Step 2 of 2" and `GET /business` afterward (or the PATCH response) reflects the saved fields.
3. Upload a real logo image — confirm the "Setting up your logo…" loading state appears, then the review screen shows the logo on both backgrounds with real extracted colors.
4. Click "Adjust colors", change the primary color, click "Use these colors" — confirm it navigates to `/dashboard` and shows the welcome message.
5. Separately, re-run onboarding and use "Skip onboarding" from the details step — confirm it goes straight to `/dashboard` with no API calls.
6. Check the Browser pane's console and network tab for unexpected errors.

- [ ] **Step 5: Commit any fixes found during manual verification**

If verification surfaces a bug, fix it, re-run the relevant test file, then:
```bash
git add <fixed files>
git commit -m "fix <what was wrong>"
```

If no bugs are found, nothing to commit for this task.

---

## Self-Review Notes

- **Spec coverage:** step flow (Task 5), details step with per-field PATCH (Task 3), logo pipeline with adjust/retry/skip (Task 4), dashboard landing (Task 6), error handling (covered inline in Tasks 3–4's tests), testing (every task is TDD). All spec sections have a corresponding task.
- **Deviation from spec, fixed inline during spec review (see spec's Section 2):** the client does not reuse `businessProfileSchema` — it defines a local `detailsFormSchema` in `DetailsStep.tsx`, same pattern as Register's `confirmPassword` extension. No shared-workspace changes in this plan.
- **Type consistency checked:** `onComplete: () => void` prop name is identical across `DetailsStep`, `LogoStep`, and how `Onboarding.tsx` calls them. `LogoStepState`'s `phase` values (`"upload" | "processing" | "review"`) are used consistently in both the component and its tests. `API_BASE_URL` is defined once in Task 1 and consumed only in Task 4.
