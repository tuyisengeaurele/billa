import { useEffect, useState } from "react";
import { apiRequest, ApiError, API_BASE_URL } from "../../lib/apiClient";
import { copyToClipboard } from "../../lib/clipboard";
import { formatRelativeTime } from "../../lib/relativeTime";
import { useToast } from "../../context/ToastContext";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { LoadErrorBanner } from "../LoadErrorBanner";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function ApiKeysSection() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    setLoadError(false);
    apiRequest<{ results: ApiKeyRow[] }>("/api-keys")
      .then((data) => setKeys(data.results))
      .catch(() => setLoadError(true));
  }, [reloadToken]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      const data = await apiRequest<{ apiKey: ApiKeyRow; key: string }>("/api-keys", {
        method: "POST",
        body: { name },
      });
      setNewKey(data.key);
      setName("");
      setKeys((current) => [data.apiKey, ...(current ?? [])]);
    } catch (err) {
      setCreateError(
        err instanceof ApiError && err.status === 409
          ? "You have 10 active keys. Revoke one to make another."
          : err instanceof ApiError && err.status === 402
            ? "Your trial has ended. Subscribe to keep creating keys."
            : "Couldn't create this key. Try again.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function copyNewKey() {
    if (!newKey) return;
    if (await copyToClipboard(newKey)) toast.success("Key copied");
    else toast.error("Couldn't copy the key. Select it and copy by hand.");
  }

  async function revoke() {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await apiRequest(`/api-keys/${revokeTarget.id}`, { method: "DELETE" });
      setKeys((current) =>
        (current ?? []).map((row) => (row.id === revokeTarget.id ? { ...row, revokedAt: new Date().toISOString() } : row)),
      );
      setRevokeTarget(null);
      toast.success("Key revoked");
    } catch {
      toast.error("Couldn't revoke this key. Try again.");
    } finally {
      setIsRevoking(false);
    }
  }

  if (loadError) {
    return <LoadErrorBanner message="Couldn't load API keys." onRetry={() => setReloadToken((t) => t + 1)} />;
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">API access</h2>
      <p className="mt-1 font-sans text-sm text-neutral-500">
        Let another system read your customers and documents, or create them. A key can do anything the API allows in
        this business, so keep it private.
      </p>

      {newKey && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-primary-500 bg-primary-100 px-4 py-3" role="status">
          <p className="font-sans text-sm font-medium text-primary-700">
            Copy this key now. It won't be shown again.
          </p>
          <code className="break-all rounded bg-surface px-3 py-2 font-mono text-xs text-neutral-900">{newKey}</code>
          <div className="flex gap-2">
            <Button type="button" variant="outline" fullWidth={false} onClick={copyNewKey}>
              Copy key
            </Button>
            <Button type="button" variant="outline" fullWidth={false} onClick={() => setNewKey(null)}>
              I've saved it
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={createKey} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <FormField
            id="apiKeyName"
            label="Key name"
            type="text"
            placeholder="Accounting sync"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" fullWidth={false} disabled={isCreating || name.trim().length === 0}>
          {isCreating ? "Creating…" : "Create key"}
        </Button>
      </form>
      {createError && (
        <div className="mt-3 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {createError}
        </div>
      )}

      {!keys && <Spinner className="mt-4" />}

      {keys && keys.length === 0 && <p className="mt-4 font-sans text-sm text-neutral-500">No keys yet.</p>}

      {keys && keys.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-neutral-100 font-sans text-sm">
          {keys.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className={row.revokedAt ? "opacity-60" : ""}>
                <p className="font-medium text-neutral-900">{row.name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                  <span className="font-mono">{row.keyPrefix}…</span>
                  <span>
                    {row.revokedAt
                      ? "Revoked"
                      : row.lastUsedAt
                        ? `Last used ${formatRelativeTime(row.lastUsedAt)}`
                        : "Never used"}
                  </span>
                </p>
              </div>
              {!row.revokedAt && (
                <Button type="button" variant="outline" fullWidth={false} onClick={() => setRevokeTarget(row)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 font-sans text-xs text-neutral-500">
        Send the key as <code className="font-mono">Authorization: Bearer YOUR_KEY</code> to{" "}
        <code className="font-mono">{API_BASE_URL || window.location.origin}/api/v1/customers</code>.
      </p>

      <Modal isOpen={revokeTarget !== null} onClose={() => setRevokeTarget(null)} title="Revoke this key?">
        <div className="flex flex-col gap-4">
          <p className="font-sans text-sm text-neutral-600">
            Anything using {revokeTarget?.name} stops working straight away. This can't be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" fullWidth={false} onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button type="button" fullWidth={false} disabled={isRevoking} onClick={revoke}>
              {isRevoking ? "Revoking…" : "Revoke key"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
