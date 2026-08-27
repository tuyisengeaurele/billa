import { useEffect, useState } from "react";
import { usePageTitle } from "../../context/PageTitleContext";
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
  emailConnected: boolean;
  firebaseConnected: boolean;
  pdfRenderingConnected: boolean;
  jobs: JobStatus[];
}

const KNOWN_JOBS = ["recurring-documents", "overdue-reminders"];

function StatusBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-semibold ${
        ok ? "bg-success-bg text-success" : "bg-error-bg text-error"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-success" : "bg-error"}`} aria-hidden="true" />
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default function AdminSystemHealth() {
  usePageTitle("System health");
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<SystemHealthResponse>("/admin/system-health")
      .then(setHealth)
      .catch(() => setError("Couldn't load system health. Try again."));
  }, []);

  return (
      <div className="flex flex-col gap-6">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-surface p-4">
                <span className="font-sans text-sm font-medium text-neutral-900">Database:</span>
                <StatusBadge ok={health.dbConnected} okLabel="Connected" badLabel="Disconnected" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-surface p-4">
                <span className="font-sans text-sm font-medium text-neutral-900">Email:</span>
                <StatusBadge ok={health.emailConnected} okLabel="Connected" badLabel="Disconnected" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-surface p-4">
                <span className="font-sans text-sm font-medium text-neutral-900">Sign-in:</span>
                <StatusBadge ok={health.firebaseConnected} okLabel="Connected" badLabel="Disconnected" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-surface p-4">
                <span className="font-sans text-sm font-medium text-neutral-900">PDF rendering:</span>
                <StatusBadge ok={health.pdfRenderingConnected} okLabel="Connected" badLabel="Disconnected" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {KNOWN_JOBS.map((jobName) => {
                const job = health.jobs.find((j) => j.jobName === jobName);
                return (
                  <div
                    key={jobName}
                    className="rounded-xl border border-neutral-200 bg-surface p-4 transition-shadow hover:shadow-sm"
                  >
                    <p className="font-sans text-sm font-semibold text-neutral-900">{jobName}</p>
                    {!job ? (
                      <p className="mt-2 font-sans text-sm text-neutral-500">Never run.</p>
                    ) : (
                      <dl className="mt-3 flex flex-col gap-2 font-sans text-sm">
                        <div className="flex items-center justify-between">
                          <dt className="text-neutral-500">Status</dt>
                          <dd>
                            <StatusBadge ok={job.succeeded} okLabel="Succeeded" badLabel="Failed" />
                          </dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-neutral-500">Last ran</dt>
                          <dd className="text-neutral-900">{new Date(job.ranAt).toLocaleString()}</dd>
                        </div>
                        {job.resultCount !== null && (
                          <div className="flex items-center justify-between">
                            <dt className="text-neutral-500">Result count</dt>
                            <dd className="tabular-nums text-neutral-900">{job.resultCount}</dd>
                          </div>
                        )}
                        {job.errorMessage && (
                          <p className="mt-1 rounded-lg bg-error-bg px-3 py-2 text-error">{job.errorMessage}</p>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
  );
}
