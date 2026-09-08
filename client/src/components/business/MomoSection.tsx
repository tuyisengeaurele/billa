import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { FormField } from "../FormField";
import { Button } from "../Button";
import { LoadErrorBanner } from "../LoadErrorBanner";
import { Spinner } from "../Spinner";

type MomoEnvironment = "sandbox" | "production";

interface MomoSettings {
  enabled: boolean;
  environment: MomoEnvironment | null;
  targetEnvironment: string | null;
  configured: boolean;
}

export function MomoSection() {
  const [settings, setSettings] = useState<MomoSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<MomoEnvironment>("sandbox");
  const [targetEnvironment, setTargetEnvironment] = useState("");
  const [subscriptionKey, setSubscriptionKey] = useState("");
  const [apiUser, setApiUser] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(false);
    apiRequest<MomoSettings>("/business/momo-settings")
      .then((data) => {
        setSettings(data);
        setEnabled(data.enabled);
        setEnvironment(data.environment ?? "sandbox");
        setTargetEnvironment(data.targetEnvironment ?? "");
      })
      .catch(() => setLoadError(true));
  }, [reloadToken]);

  function startEditing() {
    setTestResult(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setTestResult(null);
    setSubscriptionKey("");
    setApiUser("");
    setApiKey("");
  }

  async function testConnection() {
    setTestResult(null);
    setIsTesting(true);
    try {
      const result = await apiRequest<{ ok: boolean; error?: string }>("/business/momo-settings/test", {
        method: "POST",
        body: {
          environment,
          targetEnvironment: environment === "production" ? targetEnvironment : undefined,
          subscriptionKey: subscriptionKey || undefined,
          apiUser: apiUser || undefined,
          apiKey: apiKey || undefined,
        },
      });
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: "Something went wrong. Try again." });
    } finally {
      setIsTesting(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const data = await apiRequest<MomoSettings>("/business/momo-settings", {
        method: "PATCH",
        body: {
          enabled,
          environment,
          targetEnvironment: environment === "production" ? targetEnvironment : undefined,
          subscriptionKey: subscriptionKey || undefined,
          apiUser: apiUser || undefined,
          apiKey: apiKey || undefined,
        },
      });
      setSettings(data);
      cancelEditing();
    } catch (err) {
      setError(
        err instanceof ApiError ? "Couldn't save these settings. Check the values and try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return <LoadErrorBanner message="Couldn't load MTN MoMo settings." onRetry={() => setReloadToken((t) => t + 1)} />;
  }

  if (!settings) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">MTN Mobile Money</h2>
        <Spinner className="mt-4" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">MTN Mobile Money</h2>
      <p className="mt-1 font-sans text-sm text-neutral-500">
        Let customers pay an invoice straight from their MTN MoMo wallet into your own MoMo account. Bring your own
        Collections API credentials from MTN.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {error}
        </div>
      )}

      {!isEditing && (
        <div className="mt-4 flex items-center justify-between">
          <p className="font-sans text-sm text-neutral-600">
            {settings.configured ? `Configured (${settings.environment}), ${settings.enabled ? "on" : "off"}` : "Not configured yet."}
          </p>
          <Button type="button" variant="outline" fullWidth={false} onClick={startEditing}>
            {settings.configured ? "Change credentials" : "Set up"}
          </Button>
        </div>
      )}

      {isEditing && (
        <form onSubmit={save} className="mt-4 flex flex-col gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="font-sans text-sm text-neutral-800">Accept payments with MTN MoMo</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="momoEnvironment" className="font-sans text-sm font-medium text-neutral-800">
              Environment
            </label>
            <select
              id="momoEnvironment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as MomoEnvironment)}
              className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>

          {environment === "production" && (
            <div className="flex flex-col gap-1.5">
              <FormField
                id="momoTargetEnvironment"
                label="Target environment"
                type="text"
                value={targetEnvironment}
                onChange={(e) => setTargetEnvironment(e.target.value)}
              />
              <p className="font-sans text-xs text-neutral-500">
                The value MTN assigned when you registered your Collections API subscription in production.
              </p>
            </div>
          )}

          <FormField id="momoSubscriptionKey" label="Subscription key" type="password" value={subscriptionKey} onChange={(e) => setSubscriptionKey(e.target.value)} />
          <FormField id="momoApiUser" label="API user" type="password" value={apiUser} onChange={(e) => setApiUser(e.target.value)} />
          <FormField id="momoApiKey" label="API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />

          {testResult && (
            <p className={`font-sans text-sm ${testResult.ok ? "text-success" : "text-error"}`}>
              {testResult.ok ? "Connected successfully." : (testResult.error ?? "Couldn't connect.")}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" fullWidth={false} isLoading={isTesting} onClick={testConnection}>
              Test connection
            </Button>
            <Button type="submit" fullWidth={false} isLoading={isSaving}>
              Save
            </Button>
            <Button type="button" variant="outline" fullWidth={false} onClick={cancelEditing}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
