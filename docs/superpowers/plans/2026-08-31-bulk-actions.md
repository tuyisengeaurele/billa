# Bulk Actions on Items and Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user select multiple rows on the Items or Customers list and deactivate/reactivate them in one action, with the same toast+Undo feedback the single-row flow already has.

**Architecture:** A shared, presentational `BulkActionBar` component (selection count + up to two action buttons + clear) that replaces the search/export toolbar row in place once 1+ rows are selected. Selection state, the confirm modal, and the `Promise.allSettled` fan-out live per-page (mirroring how each page already owns its own single-item `confirmDeactivate`, not a shared hook) — matching this codebase's existing convention of not sharing business logic across pages that happen to look similar.

**Tech Stack:** React (local `useState`/`useEffect`), the existing `Modal`, `ToastContext`'s action-button feature (shipped earlier this session), `apiRequest`.

**Design doc:** `docs/superpowers/specs/2026-08-31-bulk-actions-design.md` — read it first for *why*.

---

## Before you start

Read the current `client/src/pages/Items.tsx` and `client/src/pages/Customers.tsx` in full — they're structurally identical (same `usePaginatedList` + single-item deactivate/reactivate pattern), and this plan's diffs assume you're looking at their current content, not guessing at it.

**A precision note on the design doc:** it describes execution as "`Promise.all`" in prose, but the partial-failure reporting it also describes (`"3 of 5 items deactivated"`) requires knowing which individual requests succeeded — `Promise.all` rejects the whole batch on the first failure and loses that information. This plan uses `Promise.allSettled` instead, which is the correct API for that requirement; this is a implementation-level correction, not a scope change.

---

### Task 1: `BulkActionBar` component

**Files:**
- Create: `client/src/components/BulkActionBar.tsx`
- Test: `client/src/components/BulkActionBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

describe("BulkActionBar", () => {
  it("shows the total selected count, pluralized correctly", () => {
    render(
      <BulkActionBar
        activeCount={2}
        inactiveCount={1}
        noun="item"
        pluralNoun="items"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("3 items selected")).toBeInTheDocument();
  });

  it("shows only Deactivate when every selected row is active", () => {
    render(
      <BulkActionBar
        activeCount={3}
        inactiveCount={0}
        noun="item"
        pluralNoun="items"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deactivate (3)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reactivate/i })).not.toBeInTheDocument();
    expect(screen.getByText("3 items selected")).toBeInTheDocument();
  });

  it("shows both buttons for a mixed selection, and calls the right handler for each", async () => {
    const onDeactivate = vi.fn();
    const onReactivate = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkActionBar
        activeCount={2}
        inactiveCount={1}
        noun="customer"
        pluralNoun="customers"
        onDeactivate={onDeactivate}
        onReactivate={onReactivate}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deactivate (2)" }));
    expect(onDeactivate).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reactivate (1)" }));
    expect(onReactivate).toHaveBeenCalled();
  });

  it("uses the singular noun for exactly one selected", () => {
    render(
      <BulkActionBar
        activeCount={1}
        inactiveCount={0}
        noun="customer"
        pluralNoun="customers"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("1 customer selected")).toBeInTheDocument();
  });

  it("calls onClear when Clear selection is clicked", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkActionBar
        activeCount={1}
        inactiveCount={0}
        noun="item"
        pluralNoun="items"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/BulkActionBar.test.tsx`
Expected: FAIL — `Cannot find module './BulkActionBar'`

- [ ] **Step 3: Write the implementation**

```tsx
interface BulkActionBarProps {
  activeCount: number;
  inactiveCount: number;
  noun: string;
  pluralNoun: string;
  onDeactivate: () => void;
  onReactivate: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  activeCount,
  inactiveCount,
  noun,
  pluralNoun,
  onDeactivate,
  onReactivate,
  onClear,
}: BulkActionBarProps) {
  const totalSelected = activeCount + inactiveCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span className="font-sans text-sm font-medium text-neutral-700">
        {totalSelected} {totalSelected === 1 ? noun : pluralNoun} selected
      </span>
      <div className="flex items-center gap-2">
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onDeactivate}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Deactivate ({activeCount})
          </button>
        )}
        {inactiveCount > 0 && (
          <button
            type="button"
            onClick={onReactivate}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Reactivate ({inactiveCount})
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          className="font-sans text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/BulkActionBar.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BulkActionBar.tsx client/src/components/BulkActionBar.test.tsx
git commit -m "add the BulkActionBar component"
```

---

### Task 2: Wire bulk selection into `Items.tsx`

**Files:**
- Modify: `client/src/pages/Items.tsx`
- Modify: `client/src/pages/Items.test.tsx`

- [ ] **Step 1: Add the imports and selection state**

Add to the imports:

```tsx
import { useEffect, useState } from "react";
```

(replaces the existing `import { useState } from "react";`)

```tsx
import { BulkActionBar } from "../components/BulkActionBar";
```

Inside the component, after `const [deactivateTarget, setDeactivateTarget] = useState<Item | null>(null);`, add:

```tsx
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"deactivate" | "reactivate" | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [list.page]);
```

- [ ] **Step 2: Add selection helpers and the bulk-action handler**

Add these functions after `confirmDeactivate` (right before `const totalPages = ...`):

```tsx
  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.results.map((item) => item.id)));
    }
  }

  async function confirmBulkAction() {
    if (!bulkAction) return;
    const isActive = bulkAction === "reactivate";
    const targetIds = selectedItems.filter((item) => item.isActive !== isActive).map((item) => item.id);

    setIsBulkProcessing(true);
    const outcomes = await Promise.allSettled(
      targetIds.map((id) => apiRequest(`/items/${id}`, { method: "PATCH", body: { isActive } })),
    );
    setIsBulkProcessing(false);
    setBulkAction(null);
    setSelectedIds(new Set());
    list.reload();

    const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    const verb = isActive ? "reactivated" : "deactivated";

    if (succeeded === targetIds.length) {
      const noun = succeeded === 1 ? "item" : "items";
      toast.success(`${succeeded} ${noun} ${verb}`, {
        label: "Undo",
        onClick: async () => {
          const undoOutcomes = await Promise.allSettled(
            targetIds.map((id) => apiRequest(`/items/${id}`, { method: "PATCH", body: { isActive: !isActive } })),
          );
          list.reload();
          const undoSucceeded = undoOutcomes.filter((outcome) => outcome.status === "fulfilled").length;
          if (undoSucceeded === targetIds.length) {
            const undoNoun = undoSucceeded === 1 ? "item" : "items";
            toast.success(`${undoSucceeded} ${undoNoun} ${isActive ? "deactivated" : "reactivated"}`);
          } else {
            toast.error(`Couldn't undo all of them. ${undoSucceeded} of ${targetIds.length} reversed.`);
          }
        },
      });
    } else {
      toast.error(`${succeeded} of ${targetIds.length} items ${verb}`);
    }
  }
```

- [ ] **Step 3: Add the derived selection values**

Find:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
```

Replace with:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const selectedItems = list.results.filter((item) => selectedIds.has(item.id));
  const selectedActiveCount = selectedItems.filter((item) => item.isActive).length;
  const selectedInactiveCount = selectedItems.filter((item) => !item.isActive).length;
  const allOnPageSelected = list.results.length > 0 && list.results.every((item) => selectedIds.has(item.id));
```

- [ ] **Step 4: Show the bar in place of the toolbar row when something is selected**

Find:

```tsx
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search items"
```

Replace with:

```tsx
          {selectedIds.size > 0 ? (
            <BulkActionBar
              activeCount={selectedActiveCount}
              inactiveCount={selectedInactiveCount}
              noun="item"
              pluralNoun="items"
              onDeactivate={() => setBulkAction("deactivate")}
              onReactivate={() => setBulkAction("reactivate")}
              onClear={() => setSelectedIds(new Set())}
            />
          ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search items"
```

Find the matching close of that toolbar `<div>` — it's the block ending right before `{list.error && (`:

```tsx
            <ExportCsvButton path="/items/export.csv" filename="items.csv" />
          </div>

          {list.error && (
```

Replace with:

```tsx
            <ExportCsvButton path="/items/export.csv" filename="items.csv" />
          </div>
          )}

          {list.error && (
```

- [ ] **Step 5: Add the checkbox column**

Find:

```tsx
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <button type="button" onClick={() => list.toggleSort("description")} className="cursor-pointer">
```

Replace with:

```tsx
              <colgroup>
                <col style={{ width: 36 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="py-2">
                    <button type="button" onClick={() => list.toggleSort("description")} className="cursor-pointer">
```

Find:

```tsx
                {list.results.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-neutral-100 hover:bg-neutral-50 ${item.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
```

Replace with:

```tsx
                {list.results.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-neutral-100 hover:bg-neutral-50 ${item.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelectRow(item.id)}
                        aria-label={`Select ${item.description}`}
                      />
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
```

- [ ] **Step 6: Add the bulk confirm modal**

Find the closing `</Modal>` of the existing single-item deactivate modal (the last one in the file, right before the final `</>`):

```tsx
          <button
            type="button"
            onClick={confirmDeactivate}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Deactivate
          </button>
        </div>
      </Modal>
    </>
  );
}
```

Replace with:

```tsx
          <button
            type="button"
            onClick={confirmDeactivate}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Deactivate
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        title={bulkAction === "reactivate" ? "Reactivate items?" : "Deactivate items?"}
      >
        <p className="font-sans text-sm text-neutral-600">
          {bulkAction === "reactivate"
            ? `Reactivate ${selectedInactiveCount} item${selectedInactiveCount === 1 ? "" : "s"}?`
            : `Deactivate ${selectedActiveCount} item${selectedActiveCount === 1 ? "" : "s"}? They'll be hidden from new documents until reactivated.`}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setBulkAction(null)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBulkProcessing}
            onClick={confirmBulkAction}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isBulkProcessing ? "Working…" : bulkAction === "reactivate" ? "Reactivate" : "Deactivate"}
          </button>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 7: Write the tests**

Add to `client/src/pages/Items.test.tsx`, inside the existing `describe("Items", ...)` block:

```tsx
  it("selects rows and bulk-deactivates them, with Undo reactivating the batch", async () => {
    let activeMap: Record<string, boolean> = { i1: true, i2: true };
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      const idMatch = url.match(/\/items\/(i\d)$/);
      if (idMatch && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        activeMap[idMatch[1]] = body.isActive;
        return new Response(JSON.stringify({ item: { id: idMatch[1], isActive: body.isActive } }), { status: 200 });
      }
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: activeMap.i1 },
              { id: "i2", description: "Delivery box", unitPrice: 1000, unit: "piece", isActive: activeMap.i2 },
            ].filter((item) => activeMap[item.id]),
            total: Object.values(activeMap).filter(Boolean).length,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("2 items selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: /deactivate items/i });
    await user.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));

    await waitFor(() => expect(screen.getByText(/no items yet/i)).toBeInTheDocument());
    expect(await screen.findByText("2 items deactivated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Printing service")).toBeInTheDocument();
    expect(await screen.findByText("Delivery box")).toBeInTheDocument();
    expect(await screen.findByText("2 items reactivated")).toBeInTheDocument();
  });

  it("shows both Deactivate and Reactivate when the selection is mixed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true },
              { id: "i2", description: "Delivery box", unitPrice: 1000, unit: "piece", isActive: false },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("checkbox", { name: "Select Printing service" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Delivery box" }));

    expect(screen.getByRole("button", { name: "Deactivate (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate (1)" })).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd client && npx vitest run src/pages/Items.test.tsx`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/Items.tsx client/src/pages/Items.test.tsx
git commit -m "add bulk deactivate/reactivate to Items"
```

---

### Task 3: Wire bulk selection into `Customers.tsx`

**Files:**
- Modify: `client/src/pages/Customers.tsx`
- Modify: `client/src/pages/Customers.test.tsx`

Same shape as Task 2, applied to `Customers.tsx`. Full diffs below — `Customers.tsx` already differs from `Items.tsx` in a few spots (its colgroup widths, and its single-item modal already says "They'll" rather than "It'll" since a customer is a "they," not an "it"), so these are written against `Customers.tsx`'s actual current content, not translated from Task 2 by find-replace.

- [ ] **Step 1: Add the imports and selection state**

Add to the imports:

```tsx
import { useEffect, useState } from "react";
```

(replaces the existing `import { useState } from "react";`)

```tsx
import { BulkActionBar } from "../components/BulkActionBar";
```

Inside the component, after `const [deactivateTarget, setDeactivateTarget] = useState<Customer | null>(null);`, add:

```tsx
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"deactivate" | "reactivate" | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [list.page]);
```

- [ ] **Step 2: Add selection helpers and the bulk-action handler**

Add these functions after `confirmDeactivate` (right before `const totalPages = ...`):

```tsx
  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.results.map((customer) => customer.id)));
    }
  }

  async function confirmBulkAction() {
    if (!bulkAction) return;
    const isActive = bulkAction === "reactivate";
    const targetIds = selectedCustomers.filter((customer) => customer.isActive !== isActive).map((customer) => customer.id);

    setIsBulkProcessing(true);
    const outcomes = await Promise.allSettled(
      targetIds.map((id) => apiRequest(`/customers/${id}`, { method: "PATCH", body: { isActive } })),
    );
    setIsBulkProcessing(false);
    setBulkAction(null);
    setSelectedIds(new Set());
    list.reload();

    const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    const verb = isActive ? "reactivated" : "deactivated";

    if (succeeded === targetIds.length) {
      const noun = succeeded === 1 ? "customer" : "customers";
      toast.success(`${succeeded} ${noun} ${verb}`, {
        label: "Undo",
        onClick: async () => {
          const undoOutcomes = await Promise.allSettled(
            targetIds.map((id) => apiRequest(`/customers/${id}`, { method: "PATCH", body: { isActive: !isActive } })),
          );
          list.reload();
          const undoSucceeded = undoOutcomes.filter((outcome) => outcome.status === "fulfilled").length;
          if (undoSucceeded === targetIds.length) {
            const undoNoun = undoSucceeded === 1 ? "customer" : "customers";
            toast.success(`${undoSucceeded} ${undoNoun} ${isActive ? "deactivated" : "reactivated"}`);
          } else {
            toast.error(`Couldn't undo all of them. ${undoSucceeded} of ${targetIds.length} reversed.`);
          }
        },
      });
    } else {
      toast.error(`${succeeded} of ${targetIds.length} customers ${verb}`);
    }
  }
```

- [ ] **Step 3: Add the derived selection values**

Find:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
```

Replace with:

```tsx
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const selectedCustomers = list.results.filter((customer) => selectedIds.has(customer.id));
  const selectedActiveCount = selectedCustomers.filter((customer) => customer.isActive).length;
  const selectedInactiveCount = selectedCustomers.filter((customer) => !customer.isActive).length;
  const allOnPageSelected = list.results.length > 0 && list.results.every((customer) => selectedIds.has(customer.id));
```

- [ ] **Step 4: Show the bar in place of the toolbar row when something is selected**

Find:

```tsx
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search customers"
```

Replace with:

```tsx
          {selectedIds.size > 0 ? (
            <BulkActionBar
              activeCount={selectedActiveCount}
              inactiveCount={selectedInactiveCount}
              noun="customer"
              pluralNoun="customers"
              onDeactivate={() => setBulkAction("deactivate")}
              onReactivate={() => setBulkAction("reactivate")}
              onClear={() => setSelectedIds(new Set())}
            />
          ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search customers"
```

Find the matching close of that toolbar `<div>`:

```tsx
            <ExportCsvButton path="/customers/export.csv" filename="customers.csv" />
          </div>

          {list.error && (
```

Replace with:

```tsx
            <ExportCsvButton path="/customers/export.csv" filename="customers.csv" />
          </div>
          )}

          {list.error && (
```

- [ ] **Step 5: Add the checkbox column**

Find:

```tsx
              <colgroup>
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <button type="button" onClick={() => list.toggleSort("name")} className="cursor-pointer">
```

Replace with:

```tsx
              <colgroup>
                <col style={{ width: 36 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="py-2">
                    <button type="button" onClick={() => list.toggleSort("name")} className="cursor-pointer">
```

Find:

```tsx
                {list.results.map((customer) => (
                  <tr
                    key={customer.id}
                    className={`border-b border-neutral-100 hover:bg-neutral-50 ${customer.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(customer)}
```

Replace with:

```tsx
                {list.results.map((customer) => (
                  <tr
                    key={customer.id}
                    className={`border-b border-neutral-100 hover:bg-neutral-50 ${customer.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleSelectRow(customer.id)}
                        aria-label={`Select ${customer.name}`}
                      />
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(customer)}
```

- [ ] **Step 6: Add the bulk confirm modal**

Find:

```tsx
          <button
            type="button"
            onClick={confirmDeactivate}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Deactivate
          </button>
        </div>
      </Modal>
    </>
  );
}
```

Replace with:

```tsx
          <button
            type="button"
            onClick={confirmDeactivate}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Deactivate
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        title={bulkAction === "reactivate" ? "Reactivate customers?" : "Deactivate customers?"}
      >
        <p className="font-sans text-sm text-neutral-600">
          {bulkAction === "reactivate"
            ? `Reactivate ${selectedInactiveCount} customer${selectedInactiveCount === 1 ? "" : "s"}?`
            : `Deactivate ${selectedActiveCount} customer${selectedActiveCount === 1 ? "" : "s"}? They'll be hidden from new documents until reactivated.`}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setBulkAction(null)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBulkProcessing}
            onClick={confirmBulkAction}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isBulkProcessing ? "Working…" : bulkAction === "reactivate" ? "Reactivate" : "Deactivate"}
          </button>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 7: Write the tests**

Add to `client/src/pages/Customers.test.tsx`, mirroring the two new tests from Task 2 Step 7 exactly, adapted to customers:

```tsx
  it("selects rows and bulk-deactivates them, with Undo reactivating the batch", async () => {
    let activeMap: Record<string, boolean> = { c1: true, c2: true };
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      const idMatch = url.match(/\/customers\/(c\d)$/);
      if (idMatch && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        activeMap[idMatch[1]] = body.isActive;
        return new Response(JSON.stringify({ customer: { id: idMatch[1], isActive: body.isActive } }), { status: 200 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: activeMap.c1 },
              { id: "c2", name: "Musanze Supplies", tin: null, address: null, phone: null, email: null, isActive: activeMap.c2 },
            ].filter((customer) => activeMap[customer.id]),
            total: Object.values(activeMap).filter(Boolean).length,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("2 customers selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: /deactivate customers/i });
    await user.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
    expect(await screen.findByText("2 customers deactivated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
    expect(await screen.findByText("Musanze Supplies")).toBeInTheDocument();
    expect(await screen.findByText("2 customers reactivated")).toBeInTheDocument();
  });

  it("shows both Deactivate and Reactivate when the selection is mixed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true },
              { id: "c2", name: "Musanze Supplies", tin: null, address: null, phone: null, email: null, isActive: false },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("checkbox", { name: "Select Kigali Traders" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Musanze Supplies" }));

    expect(screen.getByRole("button", { name: "Deactivate (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate (1)" })).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd client && npx vitest run src/pages/Customers.test.tsx`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/Customers.tsx client/src/pages/Customers.test.tsx
git commit -m "add bulk deactivate/reactivate to Customers"
```

---

### Task 4: Final verification

- [ ] **Step 1: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Full client test suite**

Run: `cd client && npx vitest run`
Expected: all green, aside from the already-documented intermittent `Profile.test.tsx` flake (see [[project_fresh_uiux_survey_2026_08_31]]) — if that specific test fails, re-run it in isolation 2-3 times before treating it as a real regression; any other failure is real and must be fixed.

- [ ] **Step 3: Manual spot-check with the browser preview**

Start the dev server preview. If a session is already authenticated in this environment, exercise the flow directly (do not create a new account or enter credentials, per this environment's standing rules):
- Select a few items/customers, confirm the action bar replaces the toolbar and shows the right counts.
- Check "Show inactive", select a mix of active and inactive rows, confirm both buttons appear and each only acts on its own subset.
- Bulk-deactivate, confirm the toast and that the list updates; click Undo, confirm everything comes back.
- Change page while something is selected, confirm the selection clears (not carried to the new page).

- [ ] **Step 4: Update project memory**

Add a `project` memory entry recording what shipped, following the format used for the earlier fresh-survey batch (`project_fresh_uiux_survey_2026_08_31.md`) — this closes out the fourth and final item from that same survey.
