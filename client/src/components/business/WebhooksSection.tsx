import { useEffect, useState } from "react";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@billa/shared";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { copyToClipboard } from "../../lib/clipboard";
import { formatRelativeTime } from "../../lib/relativeTime";
import { useToast } from "../../context/ToastContext";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { LoadErrorBanner } from "../LoadErrorBanner";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface DeliveryRow {
  id: string;
  event: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
}

const DELIVERY_STATUS_LABELS: Record<DeliveryRow["status"], string> = {
  PENDING: "Retrying",
  SUCCEEDED: "Delivered",
  FAILED: "Failed",
};

function eventLabel(event: string): string {
  return WEBHOOK_EVENT_LABELS[event as WebhookEvent] ?? event;
}

export function WebhooksSection() {
  const toast = useToast();
  const [endpoints, setEndpoints] = useState<WebhookRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openDeliveriesFor, setOpenDeliveriesFor] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);

  useEffect(() => {
    setLoadError(false);
    apiRequest<{ results: WebhookRow[] }>("/webhooks")
      .then((data) => setEndpoints(data.results))
      .catch(() => setLoadError(true));
  }, [reloadToken]);

  function toggleEvent(event: WebhookEvent) {
    setEvents((current) => (current.includes(event) ? current.filter((e) => e !== event) : [...current, event]));
  }

  async function createWebhook(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      const data = await apiRequest<{ endpoint: WebhookRow; secret: string }>("/webhooks", {
        method: "POST",
        body: { url, events },
      });
      setNewSecret(data.secret);
      setUrl("");
      setEndpoints((current) => [data.endpoint, ...(current ?? [])]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCreateError("You have 5 webhooks. Delete one to add another.");
      } else if (err instanceof ApiError && err.status === 400) {
        const reason = (err.body as { message?: string } | null)?.message;
        setCreateError(reason ?? "Check the URL and the events, then try again.");
      } else if (err instanceof ApiError && err.status === 402) {
        setCreateError("Your trial has ended. Subscribe to keep adding webhooks.");
      } else {
        setCreateError("Couldn't add this webhook. Try again.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    if (await copyToClipboard(newSecret)) toast.success("Secret copied");
    else toast.error("Couldn't copy the secret. Select it and copy by hand.");
  }

  async function setActive(row: WebhookRow, active: boolean) {
    try {
      await apiRequest(`/webhooks/${row.id}`, { method: "PATCH", body: { active } });
      setEndpoints((current) => (current ?? []).map((item) => (item.id === row.id ? { ...item, active } : item)));
    } catch {
      toast.error("Couldn't change this webhook. Try again.");
    }
  }

  async function sendTest(row: WebhookRow) {
    try {
      await apiRequest(`/webhooks/${row.id}/test`, { method: "POST" });
      toast.success("Test event sent");
      if (openDeliveriesFor === row.id) await loadDeliveries(row.id);
    } catch {
      toast.error("Couldn't send a test event. Try again.");
    }
  }

  async function loadDeliveries(id: string) {
    setDeliveries(null);
    try {
      const data = await apiRequest<{ results: DeliveryRow[] }>(`/webhooks/${id}/deliveries`);
      setDeliveries(data.results);
    } catch {
      setDeliveries([]);
      toast.error("Couldn't load recent deliveries.");
    }
  }

  async function toggleDeliveries(row: WebhookRow) {
    if (openDeliveriesFor === row.id) {
      setOpenDeliveriesFor(null);
      return;
    }
    setOpenDeliveriesFor(row.id);
    await loadDeliveries(row.id);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiRequest(`/webhooks/${deleteTarget.id}`, { method: "DELETE" });
      setEndpoints((current) => (current ?? []).filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Webhook deleted");
    } catch {
      toast.error("Couldn't delete this webhook. Try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (loadError) {
    return <LoadErrorBanner message="Couldn't load webhooks." onRetry={() => setReloadToken((t) => t + 1)} />;
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">Webhooks</h2>
      <p className="mt-1 font-sans text-sm text-neutral-500">
        Have Billa call a URL of yours when something happens, so another system hears about it straight away. Each call
        is signed with a secret you can check.
      </p>

      {newSecret && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-primary-500 bg-primary-100 px-4 py-3" role="status">
          <p className="font-sans text-sm font-medium text-primary-700">
            Copy this signing secret now. It won't be shown again.
          </p>
          <code className="break-all rounded bg-surface px-3 py-2 font-mono text-xs text-neutral-900">{newSecret}</code>
          <div className="flex gap-2">
            <Button type="button" variant="outline" fullWidth={false} onClick={copySecret}>
              Copy secret
            </Button>
            <Button type="button" variant="outline" fullWidth={false} onClick={() => setNewSecret(null)}>
              I've saved it
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={createWebhook} className="mt-4 flex flex-col gap-3">
        <FormField
          id="webhookUrl"
          label="URL to send events to"
          type="url"
          placeholder="https://example.com/billa-events"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-sans text-sm font-medium text-neutral-800">Events</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 font-sans text-sm text-neutral-700">
              <input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)} />
              {WEBHOOK_EVENT_LABELS[event]}
            </label>
          ))}
        </fieldset>
        <div>
          <Button type="submit" fullWidth={false} disabled={isCreating || url.trim().length === 0 || events.length === 0}>
            {isCreating ? "Adding…" : "Add webhook"}
          </Button>
        </div>
      </form>
      {createError && (
        <div className="mt-3 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {createError}
        </div>
      )}

      {!endpoints && <Spinner className="mt-4" />}

      {endpoints && endpoints.length === 0 && <p className="mt-4 font-sans text-sm text-neutral-500">No webhooks yet.</p>}

      {endpoints && endpoints.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-neutral-100 font-sans text-sm">
          {endpoints.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className={row.active ? "" : "opacity-60"}>
                  <p className="break-all font-medium text-neutral-900">{row.url}</p>
                  <p className="text-xs text-neutral-500">
                    {row.events.map(eventLabel).join(", ")}
                    {row.active ? "" : " (switched off)"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" fullWidth={false} onClick={() => void sendTest(row)}>
                    Send test
                  </Button>
                  <Button type="button" variant="outline" fullWidth={false} onClick={() => void toggleDeliveries(row)}>
                    {openDeliveriesFor === row.id ? "Hide deliveries" : "Recent deliveries"}
                  </Button>
                  <Button type="button" variant="outline" fullWidth={false} onClick={() => void setActive(row, !row.active)}>
                    {row.active ? "Switch off" : "Switch on"}
                  </Button>
                  <Button type="button" variant="outline" fullWidth={false} onClick={() => setDeleteTarget(row)}>
                    Delete
                  </Button>
                </div>
              </div>

              {openDeliveriesFor === row.id && (
                <div className="rounded-lg bg-neutral-50 px-3 py-2">
                  {!deliveries && <Spinner size="sm" />}
                  {deliveries && deliveries.length === 0 && (
                    <p className="text-xs text-neutral-500">Nothing has been sent to this address yet.</p>
                  )}
                  {deliveries && deliveries.length > 0 && (
                    <ul className="flex flex-col gap-1 text-xs text-neutral-600">
                      {deliveries.map((delivery) => (
                        <li key={delivery.id} className="flex flex-wrap justify-between gap-2">
                          <span>
                            {eventLabel(delivery.event)}, {formatRelativeTime(delivery.createdAt)}
                          </span>
                          <span className={delivery.status === "FAILED" ? "text-error" : ""}>
                            {DELIVERY_STATUS_LABELS[delivery.status]}
                            {delivery.lastStatusCode ? ` (${delivery.lastStatusCode})` : ""}
                            {delivery.status !== "SUCCEEDED" && delivery.lastError ? `: ${delivery.lastError}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete this webhook?">
        <div className="flex flex-col gap-4">
          <p className="font-sans text-sm text-neutral-600">
            Billa stops calling {deleteTarget?.url} and forgets its delivery history. This can't be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" fullWidth={false} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" fullWidth={false} disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting ? "Deleting…" : "Delete webhook"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
