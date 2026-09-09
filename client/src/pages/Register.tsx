import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_REQUIREMENTS } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import type { RegisterIntent } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { GoogleIcon } from "../components/icons/GoogleIcon";
import { useAuth } from "../context/AuthContext";
import { firebaseErrorCode } from "../lib/firebaseAuth";
import { ApiError } from "../lib/apiClient";

const DEFAULT_BUSINESS_NAME = "My Business";

const registerFormSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().refine((value) => PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(value)), {
      message: "Password doesn't meet the requirements below",
    }),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type RegisterFormInput = z.infer<typeof registerFormSchema>;

export default function Register() {
  const { register: registerBusiness, registerWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({ resolver: zodResolver(registerFormSchema) });
  const password = watch("password") ?? "";

  // Joining a team via an invite link never creates a business of its own, so there's
  // nothing to onboard - land straight on the dashboard, inside the invited business.
  const intent: RegisterIntent = inviteToken ? { inviteToken } : { businessName: DEFAULT_BUSINESS_NAME };

  function describeInviteError(err: unknown): string | null {
    if (!(err instanceof ApiError) || typeof err.body !== "object" || err.body === null) return null;
    const code = (err.body as { error?: string }).error;
    switch (code) {
      case "expired":
        return "That invite has expired. Ask for a new one.";
      case "already_accepted":
        return "That invite has already been used.";
      case "not_found":
        return "That invite link isn't valid, or has been revoked.";
      case "email_mismatch":
        return "That invite was sent to a different email address.";
      default:
        return null;
    }
  }

  async function onSubmit(data: RegisterFormInput) {
    setApiError(null);
    try {
      const business = await registerBusiness(data.email, data.password, intent);
      navigate(inviteToken || business.onboardingCompletedAt ? "/dashboard" : "/onboarding");
    } catch (err) {
      if (firebaseErrorCode(err) === "auth/email-already-in-use") {
        setApiError("That email is already registered. Try logging in instead.");
      } else {
        setApiError(describeInviteError(err) ?? "Something went wrong. Try again.");
      }
    }
  }

  async function handleGoogle() {
    setApiError(null);
    try {
      const business = await registerWithGoogle(intent);
      navigate(inviteToken || business.onboardingCompletedAt ? "/dashboard" : "/onboarding");
    } catch (err) {
      if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
        setApiError(describeInviteError(err) ?? "Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow={inviteToken ? "Join your team" : "Get started"}
      headline={inviteToken ? "One account away from getting to work." : "Your first professional invoice is minutes away."}
      tagline={
        inviteToken
          ? "Create your login, and you'll land straight in the business you were invited to."
          : "Add your business details once and every business document after that takes seconds."
      }
    >
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Create your account</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        Already have one?{" "}
        <Link to="/login" className="font-medium text-primary-500 hover:text-primary-700">
          Log in
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <ul className="-mt-2 flex flex-col gap-1">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = requirement.test(password);
            return (
              <li
                key={requirement.label}
                className={`font-sans text-xs transition-colors ${met ? "text-success" : "text-neutral-400"}`}
              >
                {requirement.label}
              </li>
            );
          })}
        </ul>
        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Create account
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
