import { useEffect, useState } from "react";
import { BulkActionBar } from "../components/BulkActionBar";
import { Button } from "../components/Button";
import { ExportCsvButton } from "../components/ExportCsvButton";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Modal } from "../components/Modal";
import { ItemForm, type ItemFormValues } from "../components/items/ItemForm";
import { apiRequest, ApiError } from "../lib/apiClient";
import { ariaSortValue } from "../lib/ariaSort";
import { formatRwf } from "@billa/shared";
import { usePageTitle } from "../context/PageTitleContext";
import { useToast } from "../context/ToastContext";
import { usePaginatedList } from "../lib/usePaginatedList";

interface Item {
  id: string;
  description: string;
  unitPrice: number;
  unit: string;
  taxRate: number;
  isActive: boolean;
}

type SortBy = "description" | "unitPrice" | "createdAt";

export default function Items() {
  usePageTitle("Items");
  const toast = useToast();
  const list = usePaginatedList<Item, SortBy>({ resourcePath: "/items", defaultSortBy: "createdAt" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Item | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"deactivate" | "reactivate" | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [list.page]);

  function openCreateModal() {
    setEditingItem(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(item: Item) {
    setEditingItem(item);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(values: ItemFormValues) {
    setIsSaving(true);
    setFormError(null);
    try {
      if (editingItem) {
        await apiRequest(`/items/${editingItem.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/items", { method: "POST", body: values });
      }
      setIsModalOpen(false);
      list.reload();
      toast.success(editingItem ? "Item updated" : "Item added");
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setFormError("Your trial has ended. Subscribe in Settings to continue.");
      } else {
        setFormError(
          err instanceof ApiError ? "Couldn't save that item. Try again." : "Something went wrong. Try again.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

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
    const target = deactivateTarget;
    try {
      await apiRequest(`/items/${target.id}`, { method: "PATCH", body: { isActive: false } });
      setDeactivateTarget(null);
      list.reload();
      toast.success("Item deactivated", {
        label: "Undo",
        onClick: async () => {
          try {
            await apiRequest(`/items/${target.id}`, { method: "PATCH", body: { isActive: true } });
            list.reload();
            toast.success("Item reactivated");
          } catch {
            toast.error("Couldn't undo. Reactivate it from the list instead.");
          }
        },
      });
    } catch {
      toast.error("Couldn't deactivate that item. Try again.");
    }
  }

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

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const selectedItems = list.results.filter((item) => selectedIds.has(item.id));
  const selectedActiveCount = selectedItems.filter((item) => item.isActive).length;
  const selectedInactiveCount = selectedItems.filter((item) => !item.isActive).length;
  const allOnPageSelected = list.results.length > 0 && list.results.every((item) => selectedIds.has(item.id));
  const editingValues: ItemFormValues | undefined = editingItem
    ? {
        description: editingItem.description,
        unitPrice: editingItem.unitPrice,
        unit: editingItem.unit,
        taxRate: editingItem.taxRate,
      }
    : undefined;

  return (
    <>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex justify-end">
          <Button type="button" onClick={openCreateModal} fullWidth={false} className="px-5">
            Add item
          </Button>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
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
                aria-label="Search items"
                value={list.search}
                onChange={(event) => list.updateSearch(event.target.value)}
                className="w-full max-w-xs rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              <label className="flex items-center gap-2 font-sans text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={list.includeInactive}
                  onChange={(event) => list.updateIncludeInactive(event.target.checked)}
                />
                Show inactive
              </label>
            </div>
            <ExportCsvButton path="/items/export.csv" filename="items.csv" />
          </div>
          )}

          {list.error && (
            <div className="mt-4">
              <LoadErrorBanner message={list.error} onRetry={list.reload} />
            </div>
          )}

          {list.isLoading ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading items">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">
                {list.search.trim() ? `No items match "${list.search.trim()}".` : "No items yet."}
              </p>
              <Button type="button" onClick={openCreateModal} fullWidth={false} className="px-5">
                Add item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <colgroup>
                <col style={{ width: 36 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
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
                  <th className="py-2" aria-sort={ariaSortValue(list.sortBy, "description", list.sortOrder)}>
                    <button type="button" onClick={() => list.toggleSort("description")} className="cursor-pointer">
                      Description {list.sortBy === "description" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2" aria-sort={ariaSortValue(list.sortBy, "unitPrice", list.sortOrder)}>
                    <button type="button" onClick={() => list.toggleSort("unitPrice")} className="cursor-pointer">
                      Price {list.sortBy === "unitPrice" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2">Tax</th>
                  <th className="py-2">Unit</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
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
                        className="cursor-pointer text-left font-medium text-neutral-900"
                      >
                        {item.description}
                      </button>
                    </td>
                    <td className="py-3 text-neutral-600">{formatRwf(item.unitPrice)}</td>
                    <td className="py-3 text-neutral-600">{item.taxRate}%</td>
                    <td className="py-3 text-neutral-600">{item.unit}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.isActive ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1 font-sans text-xs font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
                      >
                        {item.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {!list.isLoading && list.results.length > 0 && (
            <div className="mt-4 flex items-center justify-between font-sans text-sm text-neutral-600">
              <span>
                Page {list.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={list.page <= 1}
                  onClick={() => list.setPage(list.page - 1)}
                  className="disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={list.page >= totalPages}
                  onClick={() => list.setPage(list.page + 1)}
                  className="disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit item" : "Add item"}>
        <ItemForm initialValues={editingValues} isSubmitting={isSaving} apiError={formError} onSubmit={handleSubmit} />
      </Modal>

      <Modal isOpen={deactivateTarget !== null} onClose={() => setDeactivateTarget(null)} title="Deactivate item">
        <p className="font-sans text-sm text-neutral-600">
          Deactivate {deactivateTarget?.description}? It'll be hidden from new documents until reactivated.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeactivateTarget(null)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
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
