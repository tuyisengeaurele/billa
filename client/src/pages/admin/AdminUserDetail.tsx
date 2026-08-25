import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, ApiError } from "../../lib/apiClient";

interface AdminUser {
  id: string;
  email: string;
  isAdmin: boolean;
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

export default function AdminUserDetail() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingAdmin, setIsTogglingAdmin] = useState(false);

  useEffect(() => {
    apiRequest<UserDetailResponse>(`/admin/users/${id}`)
      .then(setDetail)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
  }, [id]);

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
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
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

          <button
            type="button"
            disabled={isSelf || isTogglingAdmin}
            onClick={toggleAdmin}
            title={isSelf ? "You can't change your own admin status" : undefined}
            className="mt-4 rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTogglingAdmin ? "Saving…" : detail.user.isAdmin ? "Revoke admin" : "Grant admin"}
          </button>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-neutral-900">Owned businesses</h2>
          {detail.ownedBusinesses.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">None.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {detail.ownedBusinesses.map((b) => (
                <li key={b.id}>
                  <Link to={`/admin/businesses/${b.id}`} className="font-sans text-sm text-primary-500 hover:underline">
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
                  <Link to={`/admin/businesses/${b.id}`} className="font-sans text-sm text-primary-500 hover:underline">
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
