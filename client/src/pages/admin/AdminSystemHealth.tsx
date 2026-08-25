import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { apiRequest } from "../../lib/apiClient";

interface JobStatus {
  jobName: string;
  ranAt: string;
  succeeded: boolean;
  resultCount: number | null;
  errorMessage: string | null;
}

interface SystemHealthResponse {
  dbConnected: boolean;
  jobs: JobStatus[];
}

const KNOWN_JOBS = ["recurring-documents", "overdue-reminders"];

export default function AdminSystemHealth() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<SystemHealthResponse>("/admin/system-health")
      .then(setHealth)
      .catch(() => setError("Couldn't load system health. Try again."));
  }, []);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">System health</h1>

        {error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {error}
          </div>
        )}

        {!health && !error && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Loading system health">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-neutral-100" />
            ))}
          </div>
        )}

        {health && (
          <>
            <div className="rounded-xl border border-neutral-200 bg-surface p-4">
              <p className="font-sans text-sm font-medium text-neutral-900">
                Database: {health.dbConnected ? "Connected" : "Disconnected"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {KNOWN_JOBS.map((jobName) => {
                const job = health.jobs.find((j) => j.jobName === jobName);
                return (
                  <div key={jobName} className="rounded-xl border border-neutral-200 bg-surface p-4">
                    <p className="font-sans text-sm font-semibold text-neutral-900">{jobName}</p>
                    {!job ? (
                      <p className="mt-2 font-sans text-sm text-neutral-500">Never run.</p>
                    ) : (
                      <dl className="mt-2 flex flex-col gap-1 font-sans text-sm">
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Status</dt>
                          <dd className={job.succeeded ? "text-success" : "text-error"}>
                            {job.succeeded ? "Succeeded" : "Failed"}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Last ran</dt>
                          <dd className="text-neutral-900">{new Date(job.ranAt).toLocaleString()}</dd>
                        </div>
                        {job.resultCount !== null && (
                          <div className="flex justify-between">
                            <dt className="text-neutral-500">Result count</dt>
                            <dd className="tabular-nums text-neutral-900">{job.resultCount}</dd>
                          </div>
                        )}
                        {job.errorMessage && <p className="mt-1 text-error">{job.errorMessage}</p>}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
