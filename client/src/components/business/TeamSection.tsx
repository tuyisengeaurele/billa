import { useEffect, useState, type FormEvent } from "react";
import { useImpersonationRequest } from "../../hooks/useImpersonationRequest";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { copyToClipboard } from "../../lib/clipboard";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { LoadErrorBanner } from "../LoadErrorBanner";

interface Member {
  id: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
}

interface Invite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  link: string;
}

export function TeamSection() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successLink, setSuccessLink] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const impersonation = useImpersonationRequest();
  const [impersonatingMemberId, setImpersonatingMemberId] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(false);
    Promise.all([
      apiRequest<{ members: Member[] }>("/business/members"),
      apiRequest<{ invites: Invite[] }>("/business/invites"),
    ])
      .then(([membersData, invitesData]) => {
        setMembers(membersData.members);
        setInvites(invitesData.invites);
        setIsOwner(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setIsOwner(false);
        } else {
          setLoadError(true);
        }
      });
  }, [reloadToken]);

  async function sendInvite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessLink(null);
    setIsInviting(true);
    try {
      const data = await apiRequest<{ invite: Invite; link: string }>("/business/invites", {
        method: "POST",
        body: { email: inviteEmail.trim() },
      });
      setInvites((prev) => [...(prev ?? []), data.invite]);
      setSuccessLink(data.link);
      setInviteEmail("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "That person is already part of your team."
          : "Couldn't send the invite. Try again.",
      );
    } finally {
      setIsInviting(false);
    }
  }

  function requestImpersonation(memberId: string) {
    setImpersonatingMemberId(memberId);
    impersonation.start(memberId);
  }

  async function removeMember(id: string) {
    setError(null);
    try {
      await apiRequest(`/business/members/${id}`, { method: "DELETE" });
      setMembers((prev) => prev?.filter((m) => m.id !== id) ?? null);
    } catch {
      setError("Couldn't remove that member. Try again.");
    }
  }

  async function copyInviteLink(invite: Invite) {
    setError(null);
    const succeeded = await copyToClipboard(invite.link);
    if (succeeded) {
      setCopiedInviteId(invite.id);
    } else {
      setError("Couldn't copy the link. Select and copy it manually instead.");
    }
  }

  async function resendInvite(id: string) {
    setError(null);
    setResendingId(id);
    try {
      const data = await apiRequest<{ invite: Invite; link: string }>(`/business/invites/${id}/resend`, {
        method: "POST",
      });
      setInvites((prev) => prev?.map((i) => (i.id === id ? { ...data.invite, link: data.link } : i)) ?? null);
      setSuccessLink(data.link);
    } catch {
      setError("Couldn't resend the invite. Try again.");
    } finally {
      setResendingId(null);
    }
  }

  async function revokeInvite(id: string) {
    setError(null);
    try {
      await apiRequest(`/business/invites/${id}`, { method: "DELETE" });
      setInvites((prev) => prev?.filter((i) => i.id !== id) ?? null);
    } catch {
      setError("Couldn't revoke that invite. Try again.");
    }
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">Team</h2>
        <div className="mt-4">
          <LoadErrorBanner message="Couldn't load your team." onRetry={() => setReloadToken((t) => t + 1)} />
        </div>
      </section>
    );
  }

  if (isOwner === null) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">Team</h2>
        <p className="mt-4 font-sans text-sm text-neutral-600">Loading…</p>
      </section>
    );
  }

  if (!isOwner) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-neutral-900">Team</h2>
        <p className="mt-4 font-sans text-sm text-neutral-600">Only the business owner can manage who has access.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">Team</h2>
      <p className="mt-1 font-sans text-sm text-neutral-500">
        Invite people to help manage documents, customers, and items.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {error}
        </div>
      )}
      {successLink && (
        <div className="mt-4 rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success">
          Invite sent. Share this link if they don't get the email:{" "}
          <span className="break-all font-mono">{successLink}</span>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {members?.map((member) => {
          const isImpersonatingThisMember = impersonatingMemberId === member.id;
          return (
            <li
              key={member.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-3.5 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-sans text-sm text-neutral-900">
                  {member.email}{" "}
                  <span className="text-neutral-400">· {member.role === "owner" ? "Owner" : "Member"}</span>
                </span>
                {member.role === "member" && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isImpersonatingThisMember && (impersonation.status === "pending" || impersonation.status === "redeeming")}
                      onClick={() => requestImpersonation(member.id)}
                      className="font-sans text-sm text-primary-500 hover:underline disabled:opacity-50"
                    >
                      {isImpersonatingThisMember && impersonation.status === "pending"
                        ? "Waiting for approval…"
                        : isImpersonatingThisMember && impersonation.status === "redeeming"
                          ? "Entering…"
                          : "Impersonate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      className="font-sans text-sm text-error hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              {isImpersonatingThisMember && impersonation.status === "denied" && (
                <p className="font-sans text-sm text-error">{member.email} denied the request.</p>
              )}
              {isImpersonatingThisMember && impersonation.status === "expired" && (
                <p className="font-sans text-sm text-neutral-600">
                  The request expired without a response. Ask them to be online and try again.
                </p>
              )}
              {isImpersonatingThisMember && impersonation.status === "error" && impersonation.errorMessage && (
                <p className="font-sans text-sm text-error">{impersonation.errorMessage}</p>
              )}
            </li>
          );
        })}
      </ul>

      {invites && invites.length > 0 && (
        <div className="mt-4">
          <h3 className="font-sans text-sm font-medium text-neutral-800">Pending invites</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-3.5 py-2.5"
              >
                <span className="font-sans text-sm text-neutral-900">{invite.email}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => copyInviteLink(invite)}
                    className="font-sans text-sm text-primary-500 hover:underline"
                  >
                    {copiedInviteId === invite.id ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    disabled={resendingId === invite.id}
                    onClick={() => resendInvite(invite.id)}
                    className="font-sans text-sm text-primary-500 hover:underline disabled:opacity-50"
                  >
                    {resendingId === invite.id ? "Resending…" : "Resend"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite(invite.id)}
                    className="font-sans text-sm text-error hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={sendInvite} className="mt-4 flex items-end gap-3">
        <FormField
          id="inviteEmail"
          label="Invite by email"
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <Button type="submit" fullWidth={false} isLoading={isInviting}>
          Send invite
        </Button>
      </form>
    </section>
  );
}
