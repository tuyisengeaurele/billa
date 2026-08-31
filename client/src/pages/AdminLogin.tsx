import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { GoogleIcon } from "../components/icons/GoogleIcon";
import { useAuth } from "../context/AuthContext";
import { firebaseErrorCode } from "../lib/firebaseAuth";

const loginFormSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type LoginFormInput = z.infer<typeof loginFormSchema>;

const INVALID_CREDENTIAL_CODES = new Set(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"]);

function isTwoFactorRequired(result: unknown): result is { twoFactorRequired: true; challengeId: string } {
  return typeof result === "object" && result !== null && "twoFactorRequired" in result;
}

export default function AdminLogin() {
  const { user, login, loginWithGoogle, completeTwoFactorChallenge, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get("expired") === "true";
  const [apiError, setApiError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [pendingAdminCheck, setPendingAdminCheck] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput>({ resolver: zodResolver(loginFormSchema) });

  useEffect(() => {
    if (!pendingAdminCheck || !user) return;
    setPendingAdminCheck(false);
    if (user.isAdmin) {
      navigate("/admin/users");
    } else {
      setApiError("This account doesn't have admin access.");
      logout();
    }
  }, [pendingAdminCheck, user, navigate, logout]);

  async function onSubmit(data: LoginFormInput) {
    setApiError(null);
    try {
      const result = await login(data.email, data.password);
      if (isTwoFactorRequired(result)) {
        setChallengeId(result.challengeId);
        return;
      }
      setPendingAdminCheck(true);
    } catch (err) {
      const code = firebaseErrorCode(err);
      if (code && INVALID_CREDENTIAL_CODES.has(code)) {
        setApiError("That email or password doesn't match our records.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  async function handleGoogle() {
    setApiError(null);
    try {
      const result = await loginWithGoogle();
      if (isTwoFactorRequired(result)) {
        setChallengeId(result.challengeId);
        return;
      }
      setPendingAdminCheck(true);
    } catch (err) {
      if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  async function handleTwoFactorSubmit(e: FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setApiError(null);
    setIsVerifying(true);
    try {
      await completeTwoFactorChallenge(challengeId, twoFactorCode.trim());
      setPendingAdminCheck(true);
    } catch {
      setApiError("That code didn't work. Try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  if (challengeId) {
    return (
      <AuthLayout eyebrow="Admin access" headline="Verify it's you." tagline="Admin sign-in requires a second step">
        <h2 className="font-display text-2xl font-semibold text-neutral-900">Enter your code</h2>
        <p className="mt-2 font-sans text-sm text-neutral-600">
          Open your authenticator app and enter the 6-digit code, or use a backup code.
        </p>

        <form onSubmit={handleTwoFactorSubmit} className="mt-6 flex flex-col gap-5" noValidate>
          {apiError && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {apiError}
            </div>
          )}
          <FormField
            id="twoFactorCode"
            label="Verification code"
            type="text"
            autoComplete="one-time-code"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
          />
          <Button type="submit" isLoading={isVerifying}>
            Verify
          </Button>
          <button
            type="button"
            onClick={() => {
              setChallengeId(null);
              setTwoFactorCode("");
              setApiError(null);
            }}
            className="self-start font-sans text-sm text-primary-500 transition-colors hover:text-primary-700"
          >
            Back to login
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Admin access" headline="Billa control room." tagline="Sign in with your admin account">
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Admin log in</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">Restricted to accounts with admin access.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5" noValidate>
        {sessionExpired && (
          <div className="rounded-lg bg-warning-bg px-4 py-3 font-sans text-sm text-warning" role="status">
            Your session expired. Log in again to continue.
          </div>
        )}
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="font-sans text-xs uppercase tracking-wide text-neutral-400">or</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <Button type="button" variant="outline" onClick={handleGoogle} className="gap-2">
        <GoogleIcon />
        Continue with Google
      </Button>
    </AuthLayout>
  );
}
