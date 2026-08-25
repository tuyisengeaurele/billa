import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
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
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiRequest<{ business: BusinessDetail }>(`/admin/businesses/${id}`)
      .then((data) => setBusiness(data.business))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
  }, [id]);

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
      </div>
    </AdminLayout>
  );
}
