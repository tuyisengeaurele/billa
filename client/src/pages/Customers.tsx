import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { CustomerForm, type CustomerFormValues, type CustomerSubmitValues } from "../components/customers/CustomerForm";
import { apiRequest, ApiError } from "../lib/apiClient";
import { usePaginatedList } from "../lib/usePaginatedList";

interface Customer {
  id: string;
  name: string;
  tin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

type SortBy = "name" | "createdAt";

export default function Customers() {
  const list = usePaginatedList<Customer, SortBy>({ resourcePath: "/customers", defaultSortBy: "createdAt" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    } catch (err) {
      setFormError(
        err instanceof ApiError ? "Couldn't save that customer. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(customer: Customer) {
    if (
      customer.isActive &&
      !window.confirm(`Deactivate ${customer.name}? They'll be hidden from new documents until reactivated.`)
    ) {
      return;
    }
    await apiRequest(`/customers/${customer.id}`, { method: "PATCH", body: { isActive: !customer.isActive } });
    list.reload();
  }

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
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
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">Customers</h1>
          <Button type="button" onClick={openCreateModal} className="w-auto px-5">
            Add customer
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search customers"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
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

        {list.error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {list.error}
          </div>
        )}

        {list.isLoading ? (
          <div className="flex flex-col gap-2" aria-label="Loading customers">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : list.results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No customers yet.</p>
            <Button type="button" onClick={openCreateModal} className="w-auto px-5">
              Add customer
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("name")}>
                  Name {list.sortBy === "name" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Phone</th>
                <th className="py-2">Email</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.results.map((customer) => (
                <tr key={customer.id} className={`border-b border-neutral-100 ${customer.isActive ? "" : "opacity-50"}`}>
                  <td className="cursor-pointer py-3" onClick={() => openEditModal(customer)}>
                    {customer.name}
                  </td>
                  <td className="py-3 text-neutral-600">{customer.phone ?? "-"}</td>
                  <td className="py-3 text-neutral-600">{customer.email ?? "-"}</td>
                  <td className="py-3 text-neutral-600">{customer.isActive ? "Active" : "Inactive"}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(customer)}
                      className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
                    >
                      {customer.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!list.isLoading && list.results.length > 0 && (
          <div className="flex items-center justify-between font-sans text-sm text-neutral-600">
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? "Edit customer" : "Add customer"}
      >
        <CustomerForm initialValues={editingValues} isSubmitting={isSaving} apiError={formError} onSubmit={handleSubmit} />
      </Modal>
    </AppLayout>
  );
}
