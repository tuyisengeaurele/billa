import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_REQUIREMENTS } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { GoogleIcon } from "../components/icons/GoogleIcon";
import { useAuth } from "../context/AuthContext";
import { firebaseErrorCode } from "../lib/firebaseAuth";

const registerFormSchema = z
  .object({
    businessName: z.string().min(1, "Enter your business name"),
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
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({ resolver: zodResolver(registerFormSchema) });
  const password = watch("password") ?? "";

  async function onSubmit(data: RegisterFormInput) {
    setApiError(null);
    try {
      await registerBusiness(data.email, data.password, data.businessName);
      navigate("/onboarding");
    } catch (err) {
      if (firebaseErrorCode(err) === "auth/email-already-in-use") {
        setApiError("That email is already registered. Try logging in instead.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  async function handleGoogle() {
    const valid = await trigger("businessName");
    if (!valid) return;
    setApiError(null);
    try {
      await registerWithGoogle(getValues("businessName"));
      navigate("/onboarding");
    } catch (err) {
      if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      headline="Your first professional invoice is minutes away."
      tagline="Add your business details once and every business document after that takes seconds."
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
          id="businessName"
          label="Business name"
          type="text"
          autoComplete="organization"
          error={errors.businessName?.message}
          {...register("businessName")}
        />
        <Button type="button" variant="outline" onClick={handleGoogle} className="gap-2">
          <GoogleIcon />
          Continue with Google
        </Button>
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
    </AuthLayout>
  );
}
