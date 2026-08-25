import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Modal } from "../../components/Modal";
import { apiRequest, ApiError } from "../../lib/apiClient";

interface Member {
  id: string;
  email: string;
  joinedAt: string;
}

interface BusinessDetail {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; email: string };
  members: Member[];
  documentCount: number;
  customerCount: number;
}

export default function AdminBusinessDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameConfirmText, setRenameConfirmText] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    apiRequest<{ business: BusinessDetail }>(`/admin/businesses/${id}`)
      .then((data) => setBusiness(data.business))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
  }, [id]);

  function openRenameModal() {
    if (!business) return;
    setNewName(business.name);
    setRenameConfirmText("");
    setIsRenameModalOpen(true);
  }

  async function handleRename() {
    if (!business) return;
    setError(null);
    setIsRenaming(true);
    try {
      const data = await apiRequest<{ business: { name: string } }>(`/admin/businesses/${id}`, {
        method: "PATCH",
        body: { name: newName.trim() },
      });
      setBusiness({ ...business, name: data.business.name });
      setIsRenameModalOpen(false);
    } catch {
      setError("Couldn't rename the business. Try again.");
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDelete() {
    if (!business) return;
    setError(null);
    setIsDeleting(true);
    try {
      await apiRequest(`/admin/businesses/${id}`, { method: "DELETE" });
      navigate("/admin/businesses");
    } catch {
      setError("Couldn't delete the business. Try again.");
      setIsDeleting(false);
    }
  }

  if (notFound) {
    return (
      <AdminLayout>
        <p className="font-sans text-sm text-neutral-600">No business found with that id.</p>
      </AdminLayout>
    );
  }

  if (!business) {
    return (
      <AdminLayout>
        <div className="flex flex-col gap-6" aria-label="Loading business">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-neutral-100" />
          <div className="h-32 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">{business.name}</h1>

        {error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Overview</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 font-sans text-sm">
            <dt className="text-neutral-500">Owner</dt>
            <dd className="text-neutral-900">
              <Link
                to={`/admin/users/${business.owner.id}`}
                className="text-primary-500 transition-colors hover:text-primary-700 hover:underline"
              >
                {business.owner.email}
              </Link>
            </dd>
            <dt className="text-neutral-500">Documents</dt>
            <dd className="text-neutral-900">{business.documentCount}</dd>
            <dt className="text-neutral-500">Customers</dt>
            <dd className="text-neutral-900">{business.customerCount}</dd>
            <dt className="text-neutral-500">Created</dt>
            <dd className="text-neutral-900">{new Date(business.createdAt).toLocaleDateString()}</dd>
          </dl>
          <button
            type="button"
            onClick={openRenameModal}
            className="mt-4 rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Rename business
          </button>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Members</h2>
          {business.members.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">No members besides the owner.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {business.members.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/admin/users/${m.id}`}
                    className="font-sans text-sm text-primary-500 transition-colors hover:text-primary-700 hover:underline"
                  >
                    {m.email}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-error/30 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Danger zone</h2>
          <p className="mt-1 font-sans text-sm text-neutral-600">
            Permanently delete this business and everything in it. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="mt-4 rounded-lg border border-error px-4 py-2 font-sans text-sm font-semibold text-error transition-colors hover:bg-error-bg"
          >
            Delete business
          </button>
        </section>
      </div>

      <Modal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        title="Rename business"
      >
        <label htmlFor="newBusinessName" className="block font-sans text-sm font-medium text-neutral-800">
          New business name
        </label>
        <input
          id="newBusinessName"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <label htmlFor="renameConfirmText" className="mt-4 block font-sans text-sm font-medium text-neutral-800">
          Type <span className="font-semibold">{business.name}</span> to confirm.
        </label>
        <input
          id="renameConfirmText"
          value={renameConfirmText}
          onChange={(e) => setRenameConfirmText(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsRenameModalOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={renameConfirmText !== business.name || !newName.trim() || isRenaming}
            onClick={handleRename}
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRenaming ? "Renaming…" : "Rename"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteConfirmText("");
        }}
        title="Delete business"
      >
        <p className="font-sans text-sm text-neutral-600">
          This permanently deletes <strong>{business.name}</strong> and all of its documents, customers, items, and
          members. This cannot be undone.
        </p>
        <label htmlFor="deleteConfirmText" className="mt-4 block font-sans text-sm font-medium text-neutral-800">
          Type <span className="font-semibold">{business.name}</span> to confirm.
        </label>
        <input
          id="deleteConfirmText"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeleteConfirmText("");
            }}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleteConfirmText !== business.name || isDeleting}
            onClick={handleDelete}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete business"}
          </button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
