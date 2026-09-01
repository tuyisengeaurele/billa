import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/apiClient";

interface InvitePreview {
  email: string;
  businessName: string;
  expired: boolean;
  alreadyAccepted: boolean;
}

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<InvitePreview>(`/invites/${token}`)
      .then(setInvite)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
  }, [token]);

  async function acceptInvite() {
    setError(null);
    setIsAccepting(true);
    try {
      await apiRequest(`/invites/${token}/accept`, { method: "POST" });
      navigate("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "This invite was sent to a different email address. Log in with that account to accept it."
          : "Couldn't accept the invite. Try again.",
      );
    } finally {
      setIsAccepting(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-sans text-sm text-neutral-600">This invite link isn't valid, or has been revoked.</p>
      </div>
    );
  }

  if (!invite || isLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
        <Spinner size="lg" />
      </div>
    );
  }

  if (invite.alreadyAccepted) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-sans text-sm text-neutral-600">This invite has already been accepted.</p>
      </div>
    );
  }

  if (invite.expired) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-sans text-sm text-neutral-600">
          This invite has expired. Ask {invite.businessName} to send you a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Join {invite.businessName}</h1>
        <p className="mt-2 font-sans text-sm text-neutral-600">
          You've been invited to help manage documents, customers, and items for {invite.businessName} on Billa.
        </p>
      </div>

      {error && (
        <div className="w-full rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {error}
        </div>
      )}

      {user ? (
        <Button type="button" isLoading={isAccepting} onClick={acceptInvite}>
          Accept invite
        </Button>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="font-sans text-sm text-neutral-600">
            Log in or create an account with {invite.email} to accept this invite.
          </p>
          <div className="flex gap-3">
            <Link
              to="/login"
              className="rounded-lg border border-neutral-200 px-5 py-2.5 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-primary-700"
            >
              Create account
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
