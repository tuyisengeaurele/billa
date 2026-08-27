import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { usePageTitle } from "../context/PageTitleContext";
import { apiRequest } from "../lib/apiClient";
import { changePassword, hasPasswordProvider } from "../lib/firebaseAuth";
import { FormField } from "../components/FormField";
import { Button } from "../components/Button";

interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export default function Profile() {
  usePageTitle("Profile");
  const { user, refreshAuth } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  function loadSessions() {
    apiRequest<{ results: SessionRow[] }>("/profile/sessions")
      .then((data) => setSessions(data.results))
      .catch(() => setSessions([]));
  }

  useEffect(loadSessions, []);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setNameError(null);
    setNameSaved(false);
    setIsSavingName(true);
    try {
      await apiRequest("/profile", { method: "PATCH", body: { name: name.trim() } });
      await refreshAuth();
      setNameSaved(true);
    } catch {
      setNameError("Couldn't save your name. Try again.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      await apiRequest("/profile/avatar", { method: "POST", body: formData });
      await refreshAuth();
    } catch {
      setAvatarError("Couldn't upload that image. Try a different file.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      await apiRequest("/profile/avatar", { method: "DELETE" });
      await refreshAuth();
    } catch {
      setAvatarError("Couldn't remove your photo. Try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch {
      setPasswordError("Couldn't change your password. Check your current password and try again.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function revokeSession(id: string) {
    setSessionsError(null);
    setRevokingId(id);
    try {
      await apiRequest(`/profile/sessions/${id}/revoke`, { method: "POST" });
      loadSessions();
    } catch {
      setSessionsError("Couldn't sign that session out. Try again.");
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeOtherSessions() {
    setSessionsError(null);
    setIsRevokingOthers(true);
    try {
      await apiRequest("/profile/sessions/revoke-others", { method: "POST" });
      loadSessions();
    } catch {
      setSessionsError("Couldn't sign out other sessions. Try again.");
    } finally {
      setIsRevokingOthers(false);
    }
  }

  if (!user) return null;

  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  const otherSessions = sessions?.filter((s) => !s.isCurrent) ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">

      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">Identity</h2>

        <div className="mt-4 flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 font-display text-xl font-semibold text-primary-700">
              {initial}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={uploadAvatar}
            />
            <div className="flex gap-3">
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-neutral-200 px-3.5 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadingAvatar ? "Saving…" : "Change photo"}
              </button>
              {user.avatarUrl && (
                <button
                  type="button"
                  disabled={isUploadingAvatar}
                  onClick={removeAvatar}
                  className="font-sans text-sm text-error hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            {avatarError && (
              <p className="font-sans text-sm text-error" role="alert">
                {avatarError}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={saveName} className="mt-6 flex flex-col gap-4">
          <FormField id="profileName" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-sm font-medium text-neutral-800">Email</label>
            <p className="rounded-lg border border-neutral-100 bg-neutral-50 px-3.5 py-2.5 font-sans text-sm text-neutral-500">
              {user.email}
            </p>
          </div>
          {nameError && (
            <p className="font-sans text-sm text-error" role="alert">
              {nameError}
            </p>
          )}
          {nameSaved && !nameError && <p className="font-sans text-sm text-success">Saved.</p>}
          <Button type="submit" fullWidth={false} isLoading={isSavingName}>
            Save name
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">Password</h2>
        {hasPasswordProvider() ? (
          <form onSubmit={submitPasswordChange} className="mt-4 flex flex-col gap-4">
            <FormField
              id="currentPassword"
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <FormField
              id="newPassword"
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <FormField
              id="confirmPassword"
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {passwordError && (
              <p className="font-sans text-sm text-error" role="alert">
                {passwordError}
              </p>
            )}
            {passwordSaved && !passwordError && <p className="font-sans text-sm text-success">Password changed.</p>}
            <Button type="submit" fullWidth={false} isLoading={isChangingPassword}>
              Update password
            </Button>
          </form>
        ) : (
          <p className="mt-2 font-sans text-sm text-neutral-600">
            You sign in with Google, so there's no Billa password to change.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-neutral-900">Active sessions</h2>
          {otherSessions.length > 0 && (
            <button
              type="button"
              disabled={isRevokingOthers}
              onClick={revokeOtherSessions}
              className="font-sans text-sm text-error hover:underline disabled:opacity-50"
            >
              {isRevokingOthers ? "Signing out…" : "Sign out of other sessions"}
            </button>
          )}
        </div>

        {sessionsError && (
          <div className="mt-3 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {sessionsError}
          </div>
        )}

        {sessions === null ? (
          <div className="mt-4 flex flex-col gap-2" aria-label="Loading sessions">
            {[0, 1].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-2.5"
              >
                <div className="font-sans text-sm text-neutral-600">
                  Signed in {new Date(session.createdAt).toLocaleString()} · expires{" "}
                  {new Date(session.expiresAt).toLocaleDateString()}
                  {session.isCurrent && <span className="ml-2 text-primary-700">This device</span>}
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    disabled={revokingId === session.id}
                    onClick={() => revokeSession(session.id)}
                    className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {revokingId === session.id ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
