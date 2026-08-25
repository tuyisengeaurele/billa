import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { GoogleIcon } from "../components/icons/GoogleIcon";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
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

export default function Login() {
  const { login, loginWithGoogle, completeTwoFactorChallenge, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput>({ resolver: zodResolver(loginFormSchema) });

  async function onSubmit(data: LoginFormInput) {
    setApiError(null);
    setResetMessage(null);
    try {
      const result = await login(data.email, data.password);
      if (isTwoFactorRequired(result)) {
        setChallengeId(result.challengeId);
        return;
      }
      navigate(result.onboardingCompletedAt ? "/dashboard" : "/onboarding");
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
    setResetMessage(null);
    try {
      const result = await loginWithGoogle();
      if (isTwoFactorRequired(result)) {
        setChallengeId(result.challengeId);
        return;
      }
      navigate(result.onboardingCompletedAt ? "/dashboard" : "/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setApiError("No account found for that Google account. Create one instead?");
      } else if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
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
      const business = await completeTwoFactorChallenge(challengeId, twoFactorCode.trim());
      navigate(business.onboardingCompletedAt ? "/dashboard" : "/onboarding");
    } catch {
      setApiError("That code didn't work. Try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleForgotPassword() {
    setApiError(null);
    const email = getValues("email");
    if (!email) {
      setApiError("Enter your email above first.");
      return;
    }
    try {
      await resetPassword(email);
    } catch {
      // Same message either way, so we don't reveal whether the email exists.
    }
    setResetMessage("Check your email for a link to reset your password.");
  }

  if (challengeId) {
    return (
      <AuthLayout eyebrow="Welcome back" headline="Back to business." tagline="Pick up where you left off">
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
            className="self-start font-sans text-sm text-primary-500 hover:text-primary-700"
          >
            Back to login
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Welcome back" headline="Back to business." tagline="Pick up where you left off">
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Log in</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        New to Billa?{" "}
        <Link to="/register" className="font-medium text-primary-500 hover:text-primary-700">
          Create an account
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        {resetMessage && (
          <div className="rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success" role="status">
            {resetMessage}
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
        <button
          type="button"
          onClick={handleForgotPassword}
          className="self-start font-sans text-sm text-primary-500 hover:text-primary-700"
        >
          Forgot password?
        </button>
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
