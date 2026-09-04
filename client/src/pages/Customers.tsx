import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BulkActionBar } from "../components/BulkActionBar";
import { Button } from "../components/Button";
import { ExportCsvButton } from "../components/ExportCsvButton";
import { LoadErrorBanner } from "../components/LoadErrorBanner";
import { Modal } from "../components/Modal";
import { SelectAllCheckbox } from "../components/SelectAllCheckbox";
import { CustomerForm, type CustomerFormValues, type CustomerSubmitValues } from "../components/customers/CustomerForm";
import { apiRequest, ApiError } from "../lib/apiClient";
import { ariaSortValue } from "../lib/ariaSort";
import { usePageTitle } from "../context/PageTitleContext";
import { useToast } from "../context/ToastContext";
import { usePaginatedList } from "../lib/usePaginatedList";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

interface Customer {
  id: string;
  name: string;
  tin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  assignedToId: string | null;
  assignedTo: TeamMember | null;
}

type SortBy = "name" | "createdAt";

export default function Customers() {
  usePageTitle("Customers");
  const toast = useToast();
  const list = usePaginatedList<Customer, SortBy>({ resourcePath: "/customers", defaultSortBy: "createdAt" });
  const exportParams = new URLSearchParams();
  if (list.search.trim()) exportParams.set("search", list.search.trim());
  if (list.includeInactive) exportParams.set("includeInactive", "true");
  const exportPath = `/customers/export.csv${exportParams.toString() ? `?${exportParams}` : ""}`;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"deactivate" | "reactivate" | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [list.page]);

  useEffect(() => {
    apiRequest<{ results: TeamMember[] }>("/customers/team-members")
      .then((data) => setTeamMembers(data.results))
      .catch(() => {});
  }, []);

  async function handleAssign(customer: Customer, assignedToId: string) {
    try {
      await apiRequest(`/customers/${customer.id}`, {
        method: "PATCH",
        body: { assignedToId: assignedToId || null },
      });
      list.reload();
      if (assignedToId) {
        const member = teamMembers.find((m) => m.id === assignedToId);
        toast.success(`${customer.name} assigned to ${member?.name ?? member?.email ?? "team member"}`);
      } else {
        toast.success(`${customer.name} unassigned`);
      }
    } catch {
      toast.error("Couldn't update the assignment. Try again.");
    }
  }

  function openCreateModal() {
    setEditingCustomer(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(values: CustomerSubmitValues) {
    setIsSaving(true);
    setFormError(null);
    try {
      if (editingCustomer) {
        await apiRequest(`/customers/${editingCustomer.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/customers", { method: "POST", body: values });
      }
      setIsModalOpen(false);
      list.reload();
      toast.success(editingCustomer ? "Customer updated" : "Customer added");
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setFormError("Your trial has ended. Subscribe in Settings to continue.");
      } else {
        setFormError(
          err instanceof ApiError ? "Couldn't save that customer. Try again." : "Something went wrong. Try again.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(customer: Customer) {
    if (customer.isActive) {
      setDeactivateTarget(customer);
      return;
    }
    try {
      await apiRequest(`/customers/${customer.id}`, { method: "PATCH", body: { isActive: true } });
      list.reload();
      toast.success("Customer reactivated");
    } catch {
      toast.error("Couldn't reactivate that customer. Try again.");
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    try {
      await apiRequest(`/customers/${target.id}`, { method: "PATCH", body: { isActive: false } });
      setDeactivateTarget(null);
      list.reload();
      toast.success("Customer deactivated", {
        label: "Undo",
        onClick: async () => {
          try {
            await apiRequest(`/customers/${target.id}`, { method: "PATCH", body: { isActive: true } });
            list.reload();
            toast.success("Customer reactivated");
          } catch {
            toast.error("Couldn't undo. Reactivate it from the list instead.");
          }
        },
      });
    } catch {
      toast.error("Couldn't deactivate that customer. Try again.");
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

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const selectedCustomers = list.results.filter((customer) => selectedIds.has(customer.id));
  const selectedActiveCount = selectedCustomers.filter((customer) => customer.isActive).length;
  const selectedInactiveCount = selectedCustomers.filter((customer) => !customer.isActive).length;
  const allOnPageSelected = list.results.length > 0 && list.results.every((customer) => selectedIds.has(customer.id));
  const editingValues: CustomerFormValues | undefined = editingCustomer
    ? {
        name: editingCustomer.name,
        tin: editingCustomer.tin ?? undefined,
        address: editingCustomer.address ?? undefined,
        phone: editingCustomer.phone ?? undefined,
        email: editingCustomer.email ?? undefined,
      }
    : undefined;

  return (
    <>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex justify-end">
          <Button type="button" onClick={openCreateModal} fullWidth={false} className="px-5">
            Add customer
          </Button>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
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
                aria-label="Search customers"
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
            <ExportCsvButton path={exportPath} filename="customers.csv" />
          </div>
          )}

          {list.error && (
            <div className="mt-4">
              <LoadErrorBanner message={list.error} onRetry={list.reload} />
            </div>
          )}

          {list.isLoading ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading customers">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
              <p className="font-sans text-sm text-neutral-600">
                {list.search.trim() ? `No customers match "${list.search.trim()}".` : "No customers yet."}
              </p>
              <Button type="button" onClick={openCreateModal} fullWidth={false} className="px-5">
                Add customer
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse font-sans text-sm">
              <colgroup>
                <col style={{ width: 36 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2">
                    <SelectAllCheckbox
                      checked={allOnPageSelected}
                      indeterminate={selectedIds.size > 0 && !allOnPageSelected}
                      onChange={toggleSelectAll}
                      ariaLabel="Select all on this page"
                    />
                  </th>
                  <th className="py-2" aria-sort={ariaSortValue(list.sortBy, "name", list.sortOrder)}>
                    <button type="button" onClick={() => list.toggleSort("name")} className="cursor-pointer">
                      Name {list.sortBy === "name" && (list.sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                  <th className="py-2">Phone</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Assigned to</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
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
                        className="cursor-pointer text-left font-medium text-neutral-900"
                      >
                        {customer.name}
                      </button>
                    </td>
                    <td className="py-3 text-neutral-600">{customer.phone ?? "-"}</td>
                    <td className="py-3 text-neutral-600">{customer.email ?? "-"}</td>
                    <td className="py-3">
                      <select
                        aria-label={`Assign ${customer.name}`}
                        value={customer.assignedToId ?? ""}
                        onChange={(event) => handleAssign(customer, event.target.value)}
                        className="w-full rounded-lg border border-neutral-200 bg-surface px-2 py-1.5 font-sans text-xs text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name ?? member.email}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          customer.isActive ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {customer.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/customers/${customer.id}/statement`}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1 font-sans text-xs font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
                        >
                          Statement
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(customer)}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1 font-sans text-xs font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
                        >
                          {customer.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? "Edit customer" : "Add customer"}
      >
        <CustomerForm initialValues={editingValues} isSubmitting={isSaving} apiError={formError} onSubmit={handleSubmit} />
      </Modal>

      <Modal isOpen={deactivateTarget !== null} onClose={() => setDeactivateTarget(null)} title="Deactivate customer">
        <p className="font-sans text-sm text-neutral-600">
          Deactivate {deactivateTarget?.name}? They'll be hidden from new documents until reactivated.
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
