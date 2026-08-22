import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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

export default function Login() {
  const { login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
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
      await login(data.email, data.password);
      navigate("/onboarding");
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
      await loginWithGoogle();
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setApiError("No account found for that Google account. Create one instead?");
      } else if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
        setApiError("Something went wrong. Try again.");
      }
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

  return (
    <AuthLayout eyebrow="Welcome back" headline="Back to business." tagline="Pick up where you left off">
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Log in</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        New to Billa?{" "}
        <Link to="/register" className="font-medium text-primary-500 hover:text-primary-700">
          Create an account
        </Link>
      </p>

      <Button type="button" variant="outline" onClick={handleGoogle} className="mt-6 gap-2">
        <GoogleIcon />
        Continue with Google
      </Button>

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
    </AuthLayout>
  );
}
