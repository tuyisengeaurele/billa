import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Button } from "../Button";
import { FormField } from "../FormField";

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUri: string;
}

export function TwoFactorSection() {
  const { user, isLoading } = useAuth();
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [isDisabling, setIsDisabling] = useState(false);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const totpEnabled = enabledOverride ?? user?.totpEnabled ?? false;

  if (isLoading) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">Two-factor authentication</h2>
        <p className="mt-4 font-sans text-sm text-neutral-600">Loading…</p>
      </section>
    );
  }

  async function startSetup() {
    setError(null);
    setIsStartingSetup(true);
    try {
      const data = await apiRequest<SetupResponse>("/auth/2fa/setup", { method: "POST" });
      setSetup(data);
    } catch {
      setError("Couldn't start setup. Try again.");
    } finally {
      setIsStartingSetup(false);
    }
  }

  async function confirmSetup() {
    setError(null);
    setIsConfirming(true);
    try {
      const data = await apiRequest<{ backupCodes: string[] }>("/auth/2fa/verify", {
        method: "POST",
        body: { code: confirmCode.trim() },
      });
      setBackupCodes(data.backupCodes);
      setEnabledOverride(true);
      setSetup(null);
      setConfirmCode("");
    } catch {
      setError("That code didn't match. Try again.");
    } finally {
      setIsConfirming(false);
    }
  }

  async function disable() {
    setError(null);
    setIsDisabling(true);
    try {
      await apiRequest("/auth/2fa/disable", { method: "POST", body: { code: disableCode.trim() } });
      setEnabledOverride(false);
      setDisableCode("");
      setBackupCodes(null);
    } catch (err) {
      setError(err instanceof ApiError ? "That code didn't match. Try again." : "Something went wrong. Try again.");
    } finally {
      setIsDisabling(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">Two-factor authentication</h2>
      <p className="mt-1 font-sans text-sm text-neutral-500">
        Require a code from an authenticator app whenever you log in.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {error}
        </div>
      )}

      {backupCodes && (
        <div className="mt-4 rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success">
          <p className="font-medium">Two-factor authentication is on. Save these backup codes somewhere safe:</p>
          <p className="mt-2 font-mono text-sm tracking-wide">{backupCodes.join("  ")}</p>
          <p className="mt-2">Each code works once, if you lose access to your authenticator app.</p>
        </div>
      )}

      {!backupCodes && totpEnabled && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="font-sans text-sm text-neutral-600">Two-factor authentication is on for your account.</p>
          <div className="flex items-end gap-3">
            <FormField
              id="disableCode"
              label="Enter a code to turn it off"
              type="text"
              autoComplete="one-time-code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
            />
            <Button type="button" variant="outline" fullWidth={false} isLoading={isDisabling} onClick={disable}>
              Turn off
            </Button>
          </div>
        </div>
      )}

      {!backupCodes && !totpEnabled && !setup && (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            isLoading={isStartingSetup}
            onClick={startSetup}
          >
            Set up two-factor authentication
          </Button>
        </div>
      )}

      {!backupCodes && !totpEnabled && setup && (
        <div className="mt-4 flex flex-col gap-3">
          <img src={setup.qrCodeDataUri} alt="Scan this QR code with your authenticator app" className="h-40 w-40" />
          <p className="font-sans text-sm text-neutral-600">
            Scan the QR code with your authenticator app, or enter this key manually:{" "}
            <span className="font-mono">{setup.secret}</span>
          </p>
          <div className="flex items-end gap-3">
            <FormField
              id="confirmCode"
              label="Enter the 6-digit code"
              type="text"
              autoComplete="one-time-code"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
            />
            <Button type="button" fullWidth={false} isLoading={isConfirming} onClick={confirmSetup}>
              Confirm
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
