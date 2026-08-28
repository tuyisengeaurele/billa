# Toast Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Billa one consistent success/error feedback mechanism (a toast), and retrofit every existing ad hoc inline confirmation across the app to use it.

**Architecture:** A `ToastProvider` (React context) holds an array of active toasts and exposes `useToast()` returning `{ success(message), error(message) }`. A `Toast` component renders one toast using the same framer-motion animation idiom `Modal.tsx` already uses. A `ToastContainer` renders the stack via a portal, bottom-right, capped at 4 visible. Mounted once in `App.tsx` alongside the existing `ThemeProvider`, so it's available on every route, public pages included.

**Tech Stack:** React context + hooks, framer-motion (already a dependency, no new package), `react-dom`'s `createPortal` (already used by `Modal.tsx`), Vitest + Testing Library (existing test stack).

**Design doc:** `docs/superpowers/specs/2026-08-28-toast-notification-system-design.md` — read it first if anything below is unclear on *why*, this plan only covers *how*.

---

## Before you start

Read `client/src/components/Modal.tsx` and `client/src/context/ThemeContext.tsx` — this plan's new files deliberately mirror their existing patterns (portal + framer-motion for `Toast`/`ToastContainer`; context + fallback-when-no-provider for `ToastContext`) so the codebase doesn't grow a second idiom for the same kind of thing.

**Two corrections to the design doc's starting table**, found while researching this plan file-by-file: `CustomerStatement.tsx`'s "copy portal link" and `DocumentView.tsx`'s "copy link" both already use an inline button-label swap ("Copy link" → "Link copied") that stays fully visible the whole time — that's the "stays inline" case per the design doc's own rule, not a toast candidate, so neither is touched by this plan. And `Documents.tsx` (the document list page) has no mutating actions of its own at all — duplication and credit notes are triggered from `DocumentView.tsx` (Task 9), not from the list page — so it's dropped from the retrofit entirely.

**A precision caveat for Tasks 16–18** (`AdminBusinessDetail.tsx`, `AdminUserDetail.tsx`, `AdminAnnouncements.tsx`): this plan's research read every `catch` block in these three files but not the exact success-path lines inside each matching `try` block (nine handlers across three files — reading all of them in full was outside this planning pass's budget). Those three tasks tell you what to read and exactly where to insert the `toast.success(...)` call, but don't hand you a verbatim before/after diff the way Tasks 6–15 do. Read the real code before editing rather than guessing from the table.

---

## Part A — Core toast system

### Task 1: ToastContext (provider + hook)

**Files:**
- Create: `client/src/context/ToastContext.tsx`
- Test: `client/src/context/ToastContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ToastProvider, useToast, useToastItems } from "./ToastContext";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("ToastContext", () => {
  it("adds a success toast and auto-dismisses it after 4 seconds", () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => ({ toast: useToast(), items: useToastItems() }),
      { wrapper },
    );

    act(() => {
      result.current.toast.success("Item saved");
    });
    expect(result.current.items.toasts).toHaveLength(1);
    expect(result.current.items.toasts[0]).toMatchObject({ variant: "success", message: "Item saved" });

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.items.toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it("adds an error toast that does not auto-dismiss", () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => ({ toast: useToast(), items: useToastItems() }),
      { wrapper },
    );

    act(() => {
      result.current.toast.error("Couldn't save. Try again.");
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.items.toasts).toHaveLength(1);
    expect(result.current.items.toasts[0].variant).toBe("error");
    vi.useRealTimers();
  });

  it("dismiss removes a toast by id", () => {
    const { result } = renderHook(
      () => ({ toast: useToast(), items: useToastItems() }),
      { wrapper },
    );

    act(() => {
      result.current.toast.error("Something failed");
    });
    const id = result.current.items.toasts[0].id;
    act(() => {
      result.current.items.dismiss(id);
    });
    expect(result.current.items.toasts).toHaveLength(0);
  });

  it("caps visible toasts at 4, dropping the oldest", () => {
    const { result } = renderHook(
      () => ({ toast: useToast(), items: useToastItems() }),
      { wrapper },
    );

    act(() => {
      result.current.toast.error("one");
      result.current.toast.error("two");
      result.current.toast.error("three");
      result.current.toast.error("four");
      result.current.toast.error("five");
    });
    expect(result.current.items.toasts).toHaveLength(4);
    expect(result.current.items.toasts.map((toast) => toast.message)).toEqual(["two", "three", "four", "five"]);
  });

  it("useToast without a provider is a harmless no-op", () => {
    const { result } = renderHook(() => useToast());
    expect(() => result.current.success("x")).not.toThrow();
    expect(() => result.current.error("x")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/context/ToastContext.test.tsx`
Expected: FAIL — `Cannot find module './ToastContext'`

- [ ] **Step 3: Write the implementation**

```tsx
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 4;
const SUCCESS_DURATION_MS = 4000;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `toast-${nextId.current++}`;
      setToasts((current) => {
        const next = [...current, { id, variant, message }];
        return next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next;
      });
      if (variant === "success") {
        setTimeout(() => dismiss(id), SUCCESS_DURATION_MS);
      }
    },
    [dismiss],
  );

  const success = useCallback((message: string) => push("success", message), [push]);
  const error = useCallback((message: string) => push("error", message), [push]);

  return <ToastContext.Provider value={{ toasts, success, error, dismiss }}>{children}</ToastContext.Provider>;
}

const FALLBACK_TOAST: ToastContextValue = {
  toasts: [],
  success: () => {},
  error: () => {},
  dismiss: () => {},
};

export function useToast(): { success: (message: string) => void; error: (message: string) => void } {
  const ctx = useContext(ToastContext) ?? FALLBACK_TOAST;
  return { success: ctx.success, error: ctx.error };
}

/** Internal — used only by ToastContainer to read/dismiss the active list. */
export function useToastItems(): { toasts: ToastItem[]; dismiss: (id: string) => void } {
  const ctx = useContext(ToastContext) ?? FALLBACK_TOAST;
  return { toasts: ctx.toasts, dismiss: ctx.dismiss };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/context/ToastContext.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/context/ToastContext.tsx client/src/context/ToastContext.test.tsx
git commit -m "add ToastContext with capped, auto-dismissing success toasts"
```

---

### Task 2: Toast component (single toast, visual)

**Files:**
- Create: `client/src/components/Toast.tsx`
- Test: `client/src/components/Toast.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders a success toast as a polite status message with no close button", () => {
    render(<Toast toast={{ id: "1", variant: "success", message: "Item saved" }} onDismiss={vi.fn()} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Item saved");
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("renders an error toast as an alert with a close button that dismisses it", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Toast toast={{ id: "err-1", variant: "error", message: "Couldn't save. Try again." }} onDismiss={onDismiss} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save. Try again.");

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith("err-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/Toast.test.tsx`
Expected: FAIL — `Cannot find module './Toast'`

- [ ] **Step 3: Write the implementation**

```tsx
import { motion } from "framer-motion";
import type { ToastItem } from "../context/ToastContext";

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const isError = toast.variant === "error";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`flex w-80 items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
        isError ? "border-transparent bg-error-bg text-error" : "border-neutral-200 bg-surface text-neutral-900"
      }`}
    >
      <p className="flex-1 font-sans text-sm font-medium">{toast.message}</p>
      {isError && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 text-lg leading-none text-error transition-opacity hover:opacity-70"
        >
          ×
        </button>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/Toast.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Toast.tsx client/src/components/Toast.test.tsx
git commit -m "add Toast visual component"
```

---

### Task 3: ToastContainer (stacking + portal)

**Files:**
- Create: `client/src/components/ToastContainer.tsx`
- Test: `client/src/components/ToastContainer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "../context/ToastContext";
import { ToastContainer } from "./ToastContainer";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success("Saved")}>
        Fire success
      </button>
      <button type="button" onClick={() => toast.error("Failed")}>
        Fire error
      </button>
    </>
  );
}

describe("ToastContainer", () => {
  it("renders toasts pushed through useToast, newest last in the stack", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
        <ToastContainer />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Fire success" }));
    await user.click(screen.getByRole("button", { name: "Fire error" }));

    const messages = [...screen.getAllByText(/Saved|Failed/)].map((el) => el.textContent);
    expect(messages).toEqual(["Saved", "Failed"]);
  });

  it("renders nothing when there are no active toasts", () => {
    render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/ToastContainer.test.tsx`
Expected: FAIL — `Cannot find module './ToastContainer'`

- [ ] **Step 3: Write the implementation**

```tsx
import { AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useToastItems } from "../context/ToastContext";
import { Toast } from "./Toast";

export function ToastContainer() {
  const { toasts, dismiss } = useToastItems();

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ToastContainer.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ToastContainer.tsx client/src/components/ToastContainer.test.tsx
git commit -m "add ToastContainer to stack and portal active toasts"
```

---

### Task 4: Wire ToastProvider + ToastContainer into App.tsx

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add the imports**

In `client/src/App.tsx`, add after the existing `ThemeProvider` import:

```tsx
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { ToastContainer } from "./components/ToastContainer";
```

- [ ] **Step 2: Mount the provider and container**

Change:

```tsx
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
            <Routes>
```

to:

```tsx
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={null}>
              <Routes>
```

(re-indent the rest of the JSX tree down to `</Routes>` by two more spaces to match), and change the closing tags at the bottom from:

```tsx
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```

to:

```tsx
              </Routes>
            </Suspense>
            <ToastContainer />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Type-check and run the existing App-level tests**

Run: `cd client && npx tsc --noEmit`
Expected: no errors

Run: `cd client && npx vitest run src/App.test.tsx`
Expected: PASS (if this file doesn't exist, skip — check with `ls client/src/App.test.tsx` first)

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "mount the toast provider and container app-wide"
```

---

### Task 5: Shared test wrapper for retrofit tests

**Files:**
- Create: `client/src/test/ToastTestWrapper.tsx`

No test file for this one — it's a test utility, not application code. It exists so every retrofit task below can wrap its existing render helper without duplicating the same three lines fifteen times.

- [ ] **Step 1: Write the file**

```tsx
import type { ReactNode } from "react";
import { ToastProvider } from "../context/ToastContext";
import { ToastContainer } from "../components/ToastContainer";

/** Wrap a test's rendered tree with this so toast assertions (`findByRole("status")`, `findByRole("alert")`) work. */
export function ToastTestWrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/test/ToastTestWrapper.tsx
git commit -m "add a shared test wrapper for toast assertions"
```

---

## Part B — Retrofit

**General pattern for every task below:**
1. In the page/component file: add `import { useToast } from "../context/ToastContext";` (adjust relative path for files under `pages/admin/`, which need `../../context/ToastContext`) and `const toast = useToast();` near the top of the component.
2. Replace the described ad hoc feedback with `toast.success(...)` / `toast.error(...)` calls exactly as shown.
3. In the matching `.test.tsx`: import `ToastTestWrapper` and wrap the existing render helper's returned JSX in it (outermost, alongside/around the existing `MemoryRouter`). Update or add the specific assertions described.
4. Run the file's test, confirm PASS, commit.

Each task lists the **exact current code** being replaced and the **exact new code**, so there's no ambiguity about what "wrap with the toast rule" means for that file.

### Task 6: Items.tsx — save and deactivate/reactivate

**Files:**
- Modify: `client/src/pages/Items.tsx`
- Modify: `client/src/pages/Items.test.tsx`

- [ ] **Step 1: Add the import and hook**

Add near the top imports:

```tsx
import { useToast } from "../context/ToastContext";
```

Inside `export default function Items() {`, right after `usePageTitle("Items");`:

```tsx
  const toast = useToast();
```

- [ ] **Step 2: Toast on save success**

Find:

```tsx
      if (editingItem) {
        await apiRequest(`/items/${editingItem.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/items", { method: "POST", body: values });
      }
      setIsModalOpen(false);
      list.reload();
    } catch (err) {
```

Replace with:

```tsx
      if (editingItem) {
        await apiRequest(`/items/${editingItem.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/items", { method: "POST", body: values });
      }
      setIsModalOpen(false);
      list.reload();
      toast.success(editingItem ? "Item updated" : "Item added");
    } catch (err) {
```

- [ ] **Step 3: Add error handling and toasts to deactivate/reactivate**

Find:

```tsx
  async function handleToggleActive(item: Item) {
    if (item.isActive) {
      setDeactivateTarget(item);
      return;
    }
    await apiRequest(`/items/${item.id}`, { method: "PATCH", body: { isActive: true } });
    list.reload();
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    await apiRequest(`/items/${deactivateTarget.id}`, { method: "PATCH", body: { isActive: false } });
    setDeactivateTarget(null);
    list.reload();
  }
```

Replace with:

```tsx
  async function handleToggleActive(item: Item) {
    if (item.isActive) {
      setDeactivateTarget(item);
      return;
    }
    try {
      await apiRequest(`/items/${item.id}`, { method: "PATCH", body: { isActive: true } });
      list.reload();
      toast.success("Item reactivated");
    } catch {
      toast.error("Couldn't reactivate that item. Try again.");
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    try {
      await apiRequest(`/items/${deactivateTarget.id}`, { method: "PATCH", body: { isActive: false } });
      setDeactivateTarget(null);
      list.reload();
      toast.success("Item deactivated");
    } catch {
      toast.error("Couldn't deactivate that item. Try again.");
    }
  }
```

- [ ] **Step 4: Update the test file**

Open `client/src/pages/Items.test.tsx`. Add the import:

```tsx
import { ToastTestWrapper } from "../test/ToastTestWrapper";
```

Find the file's render helper (it wraps `<Items />` in `MemoryRouter`/`AuthProvider`). Wrap its returned tree in `<ToastTestWrapper>`, e.g. if it currently returns:

```tsx
    <MemoryRouter>
      <AuthProvider>
        <Items />
      </AuthProvider>
    </MemoryRouter>
```

change it to:

```tsx
    <ToastTestWrapper>
      <MemoryRouter>
        <AuthProvider>
          <Items />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>
```

In the test that creates a new item (submits the add-item form), add after the existing assertion that the modal closed / list reloaded:

```tsx
    expect(await screen.findByText("Item added")).toBeInTheDocument();
```

In the test that edits an existing item, add:

```tsx
    expect(await screen.findByText("Item updated")).toBeInTheDocument();
```

In the test that deactivates an item, add:

```tsx
    expect(await screen.findByText("Item deactivated")).toBeInTheDocument();
```

If a reactivate test exists, add:

```tsx
    expect(await screen.findByText("Item reactivated")).toBeInTheDocument();
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/Items.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Items.tsx client/src/pages/Items.test.tsx
git commit -m "toast item save, deactivate, and reactivate results"
```

---

### Task 7: Customers.tsx — save and deactivate/reactivate

**Files:**
- Modify: `client/src/pages/Customers.tsx`
- Modify: `client/src/pages/Customers.test.tsx`

Same shape as Task 6 — `Customers.tsx` has the identical `handleSubmit` / `handleToggleActive` / no-catch-today structure as `Items.tsx` (confirmed while researching this plan).

- [ ] **Step 1: Add the import and hook**

Same as Task 6 Step 1, substituting the component name (`Customers`).

- [ ] **Step 2: Toast on save success**

Find:

```tsx
      setIsModalOpen(false);
      list.reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setFormError("Your trial has ended. Subscribe in Settings to continue.");
      } else {
        setFormError(
          err instanceof ApiError ? "Couldn't save that customer. Try again." : "Something went wrong. Try again.",
        );
```

Replace the `list.reload();` line with:

```tsx
      setIsModalOpen(false);
      list.reload();
      toast.success(editingCustomer ? "Customer updated" : "Customer added");
    } catch (err) {
```

(keep the rest of the catch block unchanged).

- [ ] **Step 3: Add error handling and toasts to deactivate/reactivate**

Find the `handleToggleActive` / the confirm-deactivate function for customers (mirrors `Items.tsx` lines 68–82: reactivate branch does a bare `await apiRequest(...); list.reload();`, and the confirm function does `await apiRequest(...); setDeactivateTarget(null); list.reload();`). Wrap each in `try { ... toast.success(...) } catch { toast.error(...) }` exactly as in Task 6 Step 3, using "Customer reactivated" / "Customer deactivated" and "Couldn't reactivate that customer. Try again." / "Couldn't deactivate that customer. Try again." as the messages.

- [ ] **Step 4: Update the test file**

Same pattern as Task 6 Step 4: import and wrap with `ToastTestWrapper`, then add `findByText("Customer added")`, `findByText("Customer updated")`, `findByText("Customer deactivated")` (and reactivated, if a test for it exists) after the relevant actions.

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/Customers.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Customers.tsx client/src/pages/Customers.test.tsx
git commit -m "toast customer save, deactivate, and reactivate results"
```

---

### Task 8: DocumentForm.tsx — save and finalize

**Files:**
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentForm.test.tsx`

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../context/ToastContext";` and `const toast = useToast();` near the top of the component (after `const labels = DOCUMENT_TYPE_LABELS[type];` is a reasonable spot, matching where `usePageTitle` was added earlier).

- [ ] **Step 2: Toast on save success**

Find:

```tsx
      const response = isEditing
        ? await apiRequest<{ document: DocumentResponse }>(`/documents/${id}`, { method: "PATCH", body: payload })
        : await apiRequest<{ document: DocumentResponse }>("/documents", { method: "POST", body: payload });
      navigate(`/documents/${response.document.id}/edit`, { replace: true });
    } catch (err) {
```

Replace with:

```tsx
      const response = isEditing
        ? await apiRequest<{ document: DocumentResponse }>(`/documents/${id}`, { method: "PATCH", body: payload })
        : await apiRequest<{ document: DocumentResponse }>("/documents", { method: "POST", body: payload });
      navigate(`/documents/${response.document.id}/edit`, { replace: true });
      toast.success(isEditing ? "Document saved" : "Document created");
    } catch (err) {
```

- [ ] **Step 3: Toast on finalize success**

Find:

```tsx
    try {
      await apiRequest(`/documents/${id}/finalize`, { method: "POST" });
      navigate(`/documents/${id}`);
    } catch {
      setApiError("Couldn't finalize this document. Try again.");
```

Replace with:

```tsx
    try {
      await apiRequest(`/documents/${id}/finalize`, { method: "POST" });
      navigate(`/documents/${id}`);
      toast.success("Document finalized");
    } catch {
      setApiError("Couldn't finalize this document. Try again.");
```

- [ ] **Step 4: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper(s) as in Task 6 Step 4 (this file already has a `renderEditWithLayout` helper from earlier work this session — wrap that one too, not just the default `renderPage`). In the test that submits a new document, add `expect(await screen.findByText("Document created")).toBeInTheDocument();`. In the test that edits an existing document, add `expect(await screen.findByText("Document saved")).toBeInTheDocument();`. If a finalize test exists, add `expect(await screen.findByText("Document finalized")).toBeInTheDocument();`.

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx
git commit -m "toast document save and finalize results"
```

---

### Task 9: DocumentView.tsx — convert, duplicate, delete, send

**Files:**
- Modify: `client/src/pages/DocumentView.tsx`
- Modify: `client/src/pages/DocumentView.test.tsx`

This file has the most going on. Copy-link (`handleCopyLink`, the "Copy link" / "Link copied" button) is **explicitly left unchanged** — it's an inline button-label swap that stays visible the whole time, which is exactly the "stays inline" case, not a toast candidate (this corrects the design doc's table, which had listed a copy-link case too broadly — see note below).

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Toast on convert success**

Find:

```tsx
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/convert`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't convert this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsConverting(false);
```

Replace with:

```tsx
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/convert`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
      toast.success("Converted to invoice");
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't convert this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsConverting(false);
```

- [ ] **Step 3: Replace the ad hoc "sent" message with a toast**

Find:

```tsx
  async function handleSend() {
    if (!document || !document.customer.email) return;
    setApiError(null);
    setSendMessage(null);
    setIsSending(true);
    try {
      const response = await apiRequest<{ sentAt: string }>(`/documents/${document.id}/send`, { method: "POST" });
      setDocument({ ...document, sentAt: response.sentAt });
      setSendMessage(`Sent to ${document.customer.email}`);
    } catch (err) {
```

Replace with:

```tsx
  async function handleSend() {
    if (!document || !document.customer.email) return;
    setApiError(null);
    setIsSending(true);
    try {
      const response = await apiRequest<{ sentAt: string }>(`/documents/${document.id}/send`, { method: "POST" });
      setDocument({ ...document, sentAt: response.sentAt });
      toast.success(`Sent to ${document.customer.email}`);
    } catch (err) {
```

Then remove the now-unused `sendMessage` state and its rendering:
- Delete the line `const [sendMessage, setSendMessage] = useState<string | null>(null);`
- Find and delete the JSX block:
  ```tsx
        {sendMessage && (
          ...
            {sendMessage}
          ...
        )}
  ```
  (read the surrounding lines first — Step 3's earlier grep showed this block starts at line 253; delete the whole conditional including its wrapping element)
- Find the sibling condition `{document.sentAt && !sendMessage && (` and simplify it to `{document.sentAt && (` (it no longer needs to avoid clashing with a `sendMessage` that no longer exists), keeping everything else in that block unchanged.

- [ ] **Step 4: Toast on duplicate success**

Find:

```tsx
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/duplicate`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't duplicate this document. Try again." : "Something went wrong. Try again.",
      );
      setIsDuplicating(false);
```

Replace with:

```tsx
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/duplicate`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
      toast.success("Document duplicated");
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't duplicate this document. Try again." : "Something went wrong. Try again.",
      );
      setIsDuplicating(false);
```

- [ ] **Step 5: Toast on delete success**

Find:

```tsx
    try {
      await apiRequest(`/documents/${document.id}`, { method: "DELETE" });
      navigate("/documents");
    } catch (err) {
      setDeleteError(
```

Replace with:

```tsx
    try {
      await apiRequest(`/documents/${document.id}`, { method: "DELETE" });
      navigate("/documents");
      toast.success("Document deleted");
    } catch (err) {
      setDeleteError(
```

- [ ] **Step 6: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper(s) — this file already has a local `AppLayoutRoute`-wrapped helper from earlier this session for one test; wrap that one, and the default helper too, since convert/duplicate/delete/send tests likely use the default one.

- Any test asserting `findByText(/sent to/i)` or similar for the old `sendMessage` text: change to `findByText("Sent to <the test's mock email>")` (same text, now sourced from the toast instead of the inline block — the assertion text itself may not need to change, only its wait-target now lives in the toast container instead of inline. If a test opens with a snapshot of the DOM node it was found in, no such snapshot pattern is expected here based on this codebase's style, so a plain `findByText` swap should be sufficient).
- In the convert test, add `expect(await screen.findByText("Converted to invoice")).toBeInTheDocument();`
- In the duplicate test, add `expect(await screen.findByText("Document duplicated")).toBeInTheDocument();`
- In the delete test, add `expect(await screen.findByText("Document deleted")).toBeInTheDocument();`

- [ ] **Step 7: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/DocumentView.tsx client/src/pages/DocumentView.test.tsx
git commit -m "toast document convert, duplicate, delete, and send results"
```

---

### Task 10: BusinessSettings.tsx — settings save and rename business

**Files:**
- Modify: `client/src/pages/BusinessSettings.tsx`
- Modify: `client/src/pages/BusinessSettings.test.tsx`

Account deletion (`handleDeleteAccount`) is left unchanged — the user is redirected to `/login` immediately after, so a toast would have nowhere meaningful to be seen.

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Toast on rename-business success**

Find:

```tsx
      await apiRequest("/business", { method: "PATCH", body: { name: trimmed } });
      setProfile({ ...profile, name: trimmed });
      setIsRenameModalOpen(false);
    } catch {
      setRenameError("Couldn't rename your business. Try again.");
```

Replace with:

```tsx
      await apiRequest("/business", { method: "PATCH", body: { name: trimmed } });
      setProfile({ ...profile, name: trimmed });
      setIsRenameModalOpen(false);
      toast.success("Business renamed");
    } catch {
      setRenameError("Couldn't rename your business. Try again.");
```

- [ ] **Step 3: Toast on settings save success**

Find:

```tsx
      await apiRequest("/business", { method: "PATCH", body: payload });
    } catch (err) {
      setApiError(err instanceof ApiError ? "Couldn't save your settings. Try again." : "Something went wrong. Try again.");
```

Replace with:

```tsx
      await apiRequest("/business", { method: "PATCH", body: payload });
      toast.success("Settings saved");
    } catch (err) {
      setApiError(err instanceof ApiError ? "Couldn't save your settings. Try again." : "Something went wrong. Try again.");
```

- [ ] **Step 4: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper. In the settings-save test, add `expect(await screen.findByText("Settings saved")).toBeInTheDocument();`. In the rename-business test (if one exists), add `expect(await screen.findByText("Business renamed")).toBeInTheDocument();`.

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/BusinessSettings.tsx client/src/pages/BusinessSettings.test.tsx
git commit -m "toast business settings save and rename results"
```

---

### Task 11: Profile.tsx — avatar upload/remove and session revoke

**Files:**
- Modify: `client/src/pages/Profile.tsx`
- Modify: `client/src/pages/Profile.test.tsx`

Name save and password change are **left unchanged** — both already show an inline "Saved" confirmation (`nameSaved` / `passwordSaved`) right next to the field that produced it, which is the "stays inline" case, not a toast candidate.

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Toast on avatar upload/remove**

Find:

```tsx
      await apiRequest("/profile/avatar", { method: "POST", body: formData });
      await refreshAuth();
    } catch {
      setAvatarError("Couldn't upload that image. Try a different file.");
```

Replace with:

```tsx
      await apiRequest("/profile/avatar", { method: "POST", body: formData });
      await refreshAuth();
      toast.success("Photo updated");
    } catch {
      setAvatarError("Couldn't upload that image. Try a different file.");
```

Find:

```tsx
      await apiRequest("/profile/avatar", { method: "DELETE" });
      await refreshAuth();
    } catch {
      setAvatarError("Couldn't remove your photo. Try again.");
```

Replace with:

```tsx
      await apiRequest("/profile/avatar", { method: "DELETE" });
      await refreshAuth();
      toast.success("Photo removed");
    } catch {
      setAvatarError("Couldn't remove your photo. Try again.");
```

- [ ] **Step 3: Toast on session revoke / revoke-others**

Find:

```tsx
      await apiRequest(`/profile/sessions/${id}/revoke`, { method: "POST" });
      loadSessions();
    } catch {
      setSessionsError("Couldn't sign that session out. Try again.");
```

Replace with:

```tsx
      await apiRequest(`/profile/sessions/${id}/revoke`, { method: "POST" });
      loadSessions();
      toast.success("Session signed out");
    } catch {
      setSessionsError("Couldn't sign that session out. Try again.");
```

Find:

```tsx
      await apiRequest("/profile/sessions/revoke-others", { method: "POST" });
      loadSessions();
    } catch {
      setSessionsError("Couldn't sign out other sessions. Try again.");
```

Replace with:

```tsx
      await apiRequest("/profile/sessions/revoke-others", { method: "POST" });
      loadSessions();
      toast.success("Other sessions signed out");
    } catch {
      setSessionsError("Couldn't sign out other sessions. Try again.");
```

- [ ] **Step 4: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper. Add the matching `findByText(...)` assertion to each of the four tests (avatar upload, avatar remove, revoke one session, revoke others) if they exist; if a test for one of these flows doesn't exist yet, skip adding an assertion for it rather than inventing a new test (this task is a retrofit, not new test coverage — new coverage is out of scope here).

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/Profile.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Profile.tsx client/src/pages/Profile.test.tsx
git commit -m "toast avatar and session management results"
```

---

### Task 12: Receivables.tsx — record payment and write off

**Files:**
- Modify: `client/src/pages/Receivables.tsx`
- Modify: `client/src/pages/Receivables.test.tsx`

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Toast on payment recorded**

Find:

```tsx
      await apiRequest(`/documents/${paymentTarget.id}/payments`, {
        method: "POST",
        body: { amount: Number(amount), method, paidOn, generateReceipt },
      });
      setPaymentTarget(null);
      load();
    } catch (err) {
      setPaymentError(
```

Replace with:

```tsx
      await apiRequest(`/documents/${paymentTarget.id}/payments`, {
        method: "POST",
        body: { amount: Number(amount), method, paidOn, generateReceipt },
      });
      setPaymentTarget(null);
      load();
      toast.success("Payment recorded");
    } catch (err) {
      setPaymentError(
```

- [ ] **Step 3: Toast on write-off recorded**

Find:

```tsx
      await apiRequest(`/documents/${writeOffTarget.id}/write-off`, {
        method: "POST",
        body: { writeOffReason },
      });
      setWriteOffTarget(null);
      load();
    } catch (err) {
      setWriteOffError(
```

Replace with:

```tsx
      await apiRequest(`/documents/${writeOffTarget.id}/write-off`, {
        method: "POST",
        body: { writeOffReason },
      });
      setWriteOffTarget(null);
      load();
      toast.success("Invoice written off");
    } catch (err) {
      setWriteOffError(
```

- [ ] **Step 4: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper. Add `expect(await screen.findByText("Payment recorded")).toBeInTheDocument();` to the record-payment test, and `expect(await screen.findByText("Invoice written off")).toBeInTheDocument();` to the write-off test.

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/Receivables.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Receivables.tsx client/src/pages/Receivables.test.tsx
git commit -m "toast payment and write-off results"
```

---

### Task 13: ExportCsvButton.tsx — shared export success/failure

**Files:**
- Modify: `client/src/components/ExportCsvButton.tsx`
- Modify: `client/src/components/ExportCsvButton.test.tsx`

This shared component is used by `Items.tsx`, `Customers.tsx`, and other pages via `<ExportCsvButton path=... filename=... />`. Fixing it here fixes every caller.

- [ ] **Step 1: Add the import and hook, remove the inline error state**

Replace the full file:

```tsx
import { useState } from "react";
import { downloadFile } from "../lib/downloadFile";
import { useToast } from "../context/ToastContext";

interface ExportCsvButtonProps {
  path: string;
  filename: string;
  label?: string;
}

export function ExportCsvButton({ path, filename, label = "Export CSV" }: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadFile(path, filename);
      toast.success(`Exported ${filename}`);
    } catch {
      toast.error(`Couldn't export ${filename}. Try again.`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isExporting}
      onClick={handleExport}
      className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isExporting ? "Exporting…" : label}
    </button>
  );
}
```

(the outer `<div className="flex flex-col items-end gap-2">` wrapper is removed along with the inline error paragraph it existed to stack — the button can now be a bare `<button>`; check each call site after this change in case any relied on that wrapping `<div>` for layout, and if so wrap the call site's own JSX in an equivalent `<div>` instead of restoring it inside the shared component)

- [ ] **Step 2: Check call sites for the removed wrapper div**

Run: `cd client && grep -rn "<ExportCsvButton" src`

For each result, open the file and confirm the button doesn't visually depend on the old `flex flex-col items-end gap-2` wrapper (e.g. it's already inside a flex row with other controls). Based on this plan's research, `Items.tsx` and `Customers.tsx` both place it inside an existing `flex items-center gap-4` toolbar row, so no adjustment should be needed — but verify by eye (or a quick `npm run dev` visual check if you have a browser preview available) rather than assuming.

- [ ] **Step 3: Update the test file**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import * as downloadFileModule from "../lib/downloadFile";
import { ExportCsvButton } from "./ExportCsvButton";

describe("ExportCsvButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a success toast after a successful export", async () => {
    vi.spyOn(downloadFileModule, "downloadFile").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ToastTestWrapper>
        <ExportCsvButton path="/items/export.csv" filename="items.csv" />
      </ToastTestWrapper>,
    );

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("Exported items.csv")).toBeInTheDocument();
  });

  it("shows an error toast when the export fails", async () => {
    vi.spyOn(downloadFileModule, "downloadFile").mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(
      <ToastTestWrapper>
        <ExportCsvButton path="/items/export.csv" filename="items.csv" />
      </ToastTestWrapper>,
    );

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("Couldn't export items.csv. Try again.")).toBeInTheDocument();
  });
});
```

(if the existing test file already has similar tests asserting on the old inline `<p role="alert">` error, replace them with the two tests above rather than keeping both old and new)

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd client && npx vitest run src/components/ExportCsvButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Run every test file that renders a page using ExportCsvButton, to catch fallout**

Run: `cd client && npx vitest run src/pages/Items.test.tsx src/pages/Customers.test.tsx src/pages/Documents.test.tsx`
Expected: PASS — if any fail on an old inline-export-error assertion, fix that assertion the same way as Task 6/7 (wrap with `ToastTestWrapper`, swap the assertion text). (Note: `Documents.tsx` was checked while researching this plan and doesn't use `ExportCsvButton`; verify with the grep from Step 2 which specific pages actually do before assuming this list is complete.)

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ExportCsvButton.tsx client/src/components/ExportCsvButton.test.tsx
git commit -m "toast CSV export success and failure in the shared button"
```

---

### Task 14: AdminBusinesses.tsx — export success/failure (own inline handler)

**Files:**
- Modify: `client/src/pages/admin/AdminBusinesses.tsx`
- Modify: `client/src/pages/admin/AdminBusinesses.test.tsx`

This page doesn't use the shared `ExportCsvButton` — it hand-rolls the same pattern with its own `exportError` state. Fix it the same way.

- [ ] **Step 1: Add the import and hook, remove the inline error state**

Add `import { useToast } from "../../context/ToastContext";` to the imports.

Find:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadFile("/admin/businesses/export.csv", "businesses.csv");
    } catch {
      setExportError("Couldn't export businesses. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
      <div className="flex flex-col gap-6">
        {exportError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {exportError}
          </div>
        )}
```

Replace with:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadFile("/admin/businesses/export.csv", "businesses.csv");
      toast.success("Exported businesses.csv");
    } catch {
      toast.error("Couldn't export businesses. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
      <div className="flex flex-col gap-6">
```

- [ ] **Step 2: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper. If a test currently asserts on the inline export error banner, replace it with `expect(await screen.findByText("Couldn't export businesses. Try again.")).toBeInTheDocument();` (same text, now via toast). If a success case isn't tested yet, add one modeled on Task 13 Step 3's two tests, adapted to this page's own render helper and mocking `downloadFile` from `../../lib/downloadFile`.

- [ ] **Step 3: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/admin/AdminBusinesses.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/AdminBusinesses.tsx client/src/pages/admin/AdminBusinesses.test.tsx
git commit -m "toast admin businesses CSV export success and failure"
```

---

### Task 15: AdminUsers.tsx — export success/failure (own inline handler)

**Files:**
- Modify: `client/src/pages/admin/AdminUsers.tsx`
- Modify: `client/src/pages/admin/AdminUsers.test.tsx`

Identical pattern to Task 14 — `AdminUsers.tsx` has the same hand-rolled `exportError` state, confirmed while researching this plan.

- [ ] **Step 1: Add the import and hook, remove the inline error state**

Add `import { useToast } from "../../context/ToastContext";` to the imports.

Find:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadFile("/admin/users/export.csv", "users.csv");
    } catch {
      setExportError("Couldn't export users. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
      <div className="flex flex-col gap-6">
        {exportError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {exportError}
          </div>
        )}
```

Replace with:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadFile("/admin/users/export.csv", "users.csv");
      toast.success("Exported users.csv");
    } catch {
      toast.error("Couldn't export users. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
      <div className="flex flex-col gap-6">
```

- [ ] **Step 2: Update the test file**

Same as Task 14 Step 2, adapted to "users.csv" / "Couldn't export users. Try again."

- [ ] **Step 3: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/admin/AdminUsers.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/AdminUsers.tsx client/src/pages/admin/AdminUsers.test.tsx
git commit -m "toast admin users CSV export success and failure"
```

---

### Task 16: AdminBusinessDetail.tsx — rename and delete

**Files:**
- Modify: `client/src/pages/admin/AdminBusinessDetail.tsx`
- Modify: `client/src/pages/admin/AdminBusinessDetail.test.tsx`

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Read the current success paths, then add toasts**

Read `client/src/pages/admin/AdminBusinessDetail.tsx` around `handleRename` (~line 55) and `handleDelete` (~line 73) in full — this plan's research only captured the `catch` blocks for this file, not the exact success-path lines, so confirm the precise code before editing. In `handleRename`'s `try` block, immediately after whatever state update marks the rename as applied (mirrors the `setError(null)` / API-call / state-update shape seen in every other task in this plan), add `toast.success("Business renamed");` as the last line before the function's `try` block ends. In `handleDelete`'s `try` block, immediately after the `DELETE` call and before/around wherever it navigates away, add `toast.success("Business deleted");`.

- [ ] **Step 3: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper (this file already wraps with `AdminLayoutRoute` from earlier this session — nest `ToastTestWrapper` outside that, matching how `App.tsx` nests `ToastProvider` outside `BrowserRouter`). Add `expect(await screen.findByText("Business renamed")).toBeInTheDocument();` to the rename test, and `expect(await screen.findByText("Business deleted")).toBeInTheDocument();` to the delete test, if each exists.

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/admin/AdminBusinessDetail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/admin/AdminBusinessDetail.tsx client/src/pages/admin/AdminBusinessDetail.test.tsx
git commit -m "toast admin business rename and delete results"
```

---

### Task 17: AdminUserDetail.tsx — session revoke, toggle-admin, extend-trial, suspend, delete, reinstate

**Files:**
- Modify: `client/src/pages/admin/AdminUserDetail.tsx`
- Modify: `client/src/pages/admin/AdminUserDetail.test.tsx`

Six actions on this one page, all currently silent on success (confirmed while researching this plan — every one of them only has a `catch` block, no success-path feedback at all).

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Read each handler's success path, then add a toast to each**

Read `client/src/pages/admin/AdminUserDetail.tsx` in full (it's long — this plan's research captured every `catch` block below but not the exact success-path lines in each `try`). For each of the six handlers, add one `toast.success(...)` call as the last line of the `try` block, right before the function would otherwise fall through to `finally`:

| Handler (~line, per this plan's research) | Toast message |
|---|---|
| session revoke (~78) | `"Session signed out"` |
| toggle-admin (~92) | admin status now on/off — use `toast.success(data.user.isAdmin ? "Admin access granted" : "Admin access revoked")`, reusing whatever variable the existing code already assigns the API response to |
| extend-trial (~109) | `"Trial extended"` |
| suspend (~126) | `"Account suspended"` |
| delete (~150) | `"Account deleted"` |
| reinstate (~169) | `"Account reinstated"` |

- [ ] **Step 3: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper (this file already has a breadcrumb test using an `AdminLayoutRoute`-wrapped helper from earlier this session — nest `ToastTestWrapper` outside it). For each of the six actions that has an existing test, add the matching `expect(await screen.findByText("<message from the table above>")).toBeInTheDocument();`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/admin/AdminUserDetail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/admin/AdminUserDetail.tsx client/src/pages/admin/AdminUserDetail.test.tsx
git commit -m "toast admin user action results"
```

---

### Task 18: AdminAnnouncements.tsx — post and deactivate

**Files:**
- Modify: `client/src/pages/admin/AdminAnnouncements.tsx`
- Modify: `client/src/pages/admin/AdminAnnouncements.test.tsx`

- [ ] **Step 1: Add the import and hook**

Add `import { useToast } from "../../context/ToastContext";` and `const toast = useToast();` near the top of the component.

- [ ] **Step 2: Toast on post success**

Find:

```tsx
    try {
      await apiRequest("/admin/announcements", { method: "POST", body: { message: message.trim() } });
```

Read the two or three lines immediately after that `apiRequest` call (this plan's research didn't capture what happens between the POST and the `catch` — likely clearing the input and reloading the list) and add `toast.success("Announcement posted");` as the new last line of the `try` block, after that existing success handling, before the `catch` on the line captured by this research (`} catch { setError("Couldn't post the announcement. Try again."); }`).

- [ ] **Step 3: Toast on deactivate success**

Find:

```tsx
    try {
      await apiRequest(`/admin/announcements/${id}/deactivate`, { method: "POST" });
```

Same approach: read the line(s) between this call and the `catch` (`} catch { setError("Couldn't deactivate the announcement. Try again."); }`) and add `toast.success("Announcement deactivated");` as the new last line of the `try` block.

- [ ] **Step 4: Update the test file**

Add the `ToastTestWrapper` import and wrap the render helper. Add `expect(await screen.findByText("Announcement posted")).toBeInTheDocument();` to the post test, and `expect(await screen.findByText("Announcement deactivated")).toBeInTheDocument();` to the deactivate test, if each exists.

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/pages/admin/AdminAnnouncements.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/AdminAnnouncements.tsx client/src/pages/admin/AdminAnnouncements.test.tsx
git commit -m "toast admin announcement post and deactivate results"
```

---

## Part C — Final verification

### Task 19: Full suite, type-check, and a manual spot-check

- [ ] **Step 1: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors — this will catch any relative-import-path mistakes (e.g. `../context/ToastContext` vs `../../context/ToastContext` in the `pages/admin/` files).

- [ ] **Step 2: Full test suite**

Run: `cd client && npx vitest run`
Expected: all green. Per this project's established pattern (see this session's earlier work), if a handful of unrelated tests fail on a full parallel run but pass individually, that's likely pre-existing environmental flakiness — re-run the specific failing file in isolation before treating it as a real regression from this plan.

- [ ] **Step 3: Manual spot-check with the browser preview**

Start the dev server preview, log in as a test business user (if a session is already authenticated in this environment — do not create a new account or enter credentials per this environment's standing rules), and:
- Save an item → confirm a toast reading "Item added" or "Item updated" appears bottom-right and vanishes after ~4s.
- Trigger a CSV export → confirm the success toast, then mock/force a failure if feasible and confirm the error toast has a working × close button and does not auto-dismiss.
- Resize to a narrow/mobile viewport and confirm the toast doesn't overlap unreadable with the bottom nav or overflow the screen edge.

- [ ] **Step 4: Update project memory**

This plan is large enough, and changes enough files, that it's worth a `project` memory entry once shipped (title, scope, date), following this project's established pattern of recording each major batch of work — see `project_backlog_batch_2026_08_27.md` for the format to match.
