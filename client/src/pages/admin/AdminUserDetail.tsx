import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, ApiError } from "../../lib/apiClient";

interface AdminUser {
  id: string;
  email: string;
  isAdmin: boolean;
  suspendedAt: string | null;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: string | null;
  createdAt: string;
}

interface BusinessRef {
  id: string;
  name: string;
}

interface UserDetailResponse {
  user: AdminUser;
  ownedBusinesses: BusinessRef[];
  memberBusinesses: BusinessRef[];
}

interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const { user: currentUser, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingAdmin, setIsTogglingAdmin] = useState(false);
  const [extendDays, setExtendDays] = useState("14");
  const [isExtendingTrial, setIsExtendingTrial] = useState(false);
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    apiRequest<UserDetailResponse>(`/admin/users/${id}`)
      .then(setDetail)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
  }, [id]);

  function loadSessions() {
    apiRequest<{ results: SessionRow[] }>(`/admin/users/${id}/sessions`)
      .then((data) => setSessions(data.results))
      .catch(() => setSessions([]));
  }

  useEffect(loadSessions, [id]);

  async function revokeSession(sessionId: string) {
    setError(null);
    setRevokingSessionId(sessionId);
    try {
      await apiRequest(`/admin/users/${id}/sessions/${sessionId}/revoke`, { method: "POST" });
      loadSessions();
    } catch {
      setError("Couldn't revoke the session. Try again.");
    } finally {
      setRevokingSessionId(null);
    }
  }

  async function toggleAdmin() {
    if (!detail) return;
    setError(null);
    setIsTogglingAdmin(true);
    try {
      const data = await apiRequest<{ user: { id: string; isAdmin: boolean } }>(`/admin/users/${id}/toggle-admin`, {
        method: "POST",
      });
      setDetail({ ...detail, user: { ...detail.user, isAdmin: data.user.isAdmin } });
    } catch {
      setError("Couldn't change admin status. Try again.");
    } finally {
      setIsTogglingAdmin(false);
    }
  }

  async function extendTrial() {
    if (!detail) return;
    const days = Number(extendDays);
    setError(null);
    setIsExtendingTrial(true);
    try {
      const data = await apiRequest<{ trialEndsAt: string }>(`/admin/users/${id}/extend-trial`, {
        method: "POST",
        body: { days },
      });
      setDetail({ ...detail, user: { ...detail.user, trialEndsAt: data.trialEndsAt } });
    } catch {
      setError("Couldn't extend the trial. Try again.");
    } finally {
      setIsExtendingTrial(false);
    }
  }

  async function confirmSuspend() {
    if (!detail) return;
    setError(null);
    setIsSuspending(true);
    try {
      await apiRequest(`/admin/users/${id}/suspend`, { method: "POST" });
      setDetail({ ...detail, user: { ...detail.user, suspendedAt: new Date().toISOString() } });
      setIsSuspendModalOpen(false);
    } catch {
      setError("Couldn't suspend the account. Try again.");
    } finally {
      setIsSuspending(false);
    }
  }

  async function impersonate() {
    if (!detail) return;
    setError(null);
    setIsImpersonating(true);
    try {
      await apiRequest(`/admin/users/${id}/impersonate`, { method: "POST" });
      await refreshAuth();
      navigate("/dashboard");
    } catch {
      setError("Couldn't start impersonation. Try again.");
      setIsImpersonating(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    setError(null);
    setIsDeleting(true);
    try {
      await apiRequest(`/admin/users/${id}`, { method: "DELETE" });
      navigate("/admin/users");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Can't delete an account with an admin action history."
          : "Couldn't delete the account. Try again.",
      );
      setIsDeleting(false);
    }
  }

  async function reinstate() {
    if (!detail) return;
    setError(null);
    setIsSuspending(true);
    try {
      await apiRequest(`/admin/users/${id}/reinstate`, { method: "POST" });
      setDetail({ ...detail, user: { ...detail.user, suspendedAt: null } });
    } catch {
      setError("Couldn't reinstate the account. Try again.");
    } finally {
      setIsSuspending(false);
    }
  }

  if (notFound) {
    return (
      <AdminLayout>
        <p className="font-sans text-sm text-neutral-600">No user found with that id.</p>
      </AdminLayout>
    );
  }

  if (!detail) {
    return (
      <AdminLayout>
        <div className="flex flex-col gap-6" aria-label="Loading user">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-neutral-100" />
          <div className="h-48 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        </div>
      </AdminLayout>
    );
  }

  const isSelf = currentUser?.id === detail.user.id;

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">{detail.user.email}</h1>

        {error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Account</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 font-sans text-sm">
            <dt className="text-neutral-500">Admin</dt>
            <dd className="text-neutral-900">{detail.user.isAdmin ? "Yes" : "No"}</dd>
            <dt className="text-neutral-500">Trial ends</dt>
            <dd className="text-neutral-900">{new Date(detail.user.trialEndsAt).toLocaleDateString()}</dd>
            <dt className="text-neutral-500">Plan</dt>
            <dd className="text-neutral-900">{detail.user.plan ?? "None"}</dd>
            <dt className="text-neutral-500">Joined</dt>
            <dd className="text-neutral-900">{new Date(detail.user.createdAt).toLocaleDateString()}</dd>
          </dl>

          <div className="mt-4 flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="extendDays" className="font-sans text-sm font-medium text-neutral-800">
                Extend trial by (days)
              </label>
              <input
                id="extendDays"
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="w-28 rounded-lg border border-neutral-200 bg-surface px-3.5 py-2 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <button
              type="button"
              disabled={isExtendingTrial}
              onClick={extendTrial}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExtendingTrial ? "Extending…" : "Extend trial"}
            </button>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={isSelf || isTogglingAdmin}
              onClick={toggleAdmin}
              title={isSelf ? "You can't change your own admin status" : undefined}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTogglingAdmin ? "Saving…" : detail.user.isAdmin ? "Revoke admin" : "Grant admin"}
            </button>

            {detail.user.suspendedAt ? (
              <button
                type="button"
                disabled={isSuspending}
                onClick={reinstate}
                className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSuspending ? "Saving…" : "Reinstate"}
              </button>
            ) : (
              <button
                type="button"
                disabled={isSelf}
                onClick={() => setIsSuspendModalOpen(true)}
                title={isSelf ? "You can't suspend your own account" : undefined}
                className="rounded-lg border border-error px-4 py-2 font-sans text-sm font-semibold text-error transition-colors hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
              >
                Suspend
              </button>
            )}

            <button
              type="button"
              disabled={isSelf || isImpersonating}
              onClick={impersonate}
              title={isSelf ? "You can't impersonate yourself" : undefined}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImpersonating ? "Entering…" : "Impersonate"}
            </button>
          </div>

          {detail.user.suspendedAt && (
            <p className="mt-3 font-sans text-sm text-error">
              Suspended since {new Date(detail.user.suspendedAt).toLocaleDateString()}.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Active sessions</h2>
          {sessions === null ? (
            <div className="mt-4 flex flex-col gap-2" aria-label="Loading sessions">
              {[0, 1].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">No active sessions.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-2.5"
                >
                  <div className="font-sans text-sm text-neutral-600">
                    Signed in {new Date(s.createdAt).toLocaleString()} · expires{" "}
                    {new Date(s.expiresAt).toLocaleDateString()}
                  </div>
                  <button
                    type="button"
                    disabled={revokingSessionId === s.id}
                    onClick={() => revokeSession(s.id)}
                    className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {revokingSessionId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-error/30 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Danger zone</h2>
          <p className="mt-1 font-sans text-sm text-neutral-600">
            Permanently delete this account. If they own any businesses, those are deleted too, along with all
            documents, customers, and items. This cannot be undone.
          </p>
          <button
            type="button"
            disabled={isSelf}
            onClick={() => setIsDeleteModalOpen(true)}
            title={isSelf ? "You can't delete your own account" : undefined}
            className="mt-4 rounded-lg border border-error px-4 py-2 font-sans text-sm font-semibold text-error transition-colors hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete account
          </button>
        </section>

        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeleteConfirmText("");
          }}
          title="Delete account"
        >
          <p className="font-sans text-sm text-neutral-600">
            This permanently deletes <strong>{detail.user.email}</strong>
            {detail.ownedBusinesses.length > 0 ? " and every business they own, with all its data" : ""}. This cannot
            be undone.
          </p>
          <label htmlFor="deleteUserConfirmText" className="mt-4 block font-sans text-sm font-medium text-neutral-800">
            Type <span className="font-semibold">{detail.user.email}</span> to confirm.
          </label>
          <input
            id="deleteUserConfirmText"
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
              disabled={deleteConfirmText !== detail.user.email || isDeleting}
              onClick={handleDelete}
              className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </Modal>

        <Modal isOpen={isSuspendModalOpen} onClose={() => setIsSuspendModalOpen(false)} title="Suspend account">
          <p className="font-sans text-sm text-neutral-600">
            Suspend {detail.user.email}? They'll be signed out and unable to log back in until reinstated.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsSuspendModalOpen(false)}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSuspending}
              onClick={confirmSuspend}
              className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSuspending ? "Suspending…" : "Suspend"}
            </button>
          </div>
        </Modal>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Owned businesses</h2>
          {detail.ownedBusinesses.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">None.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {detail.ownedBusinesses.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/admin/businesses/${b.id}`}
                    className="font-sans text-sm text-primary-500 transition-colors hover:text-primary-700 hover:underline"
                  >
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Member of</h2>
          {detail.memberBusinesses.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">None.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {detail.memberBusinesses.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/admin/businesses/${b.id}`}
                    className="font-sans text-sm text-primary-500 transition-colors hover:text-primary-700 hover:underline"
                  >
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
