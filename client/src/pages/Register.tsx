import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

export default function Register() {
  const { register: registerBusiness } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterInput) {
    setApiError(null);
    try {
      await registerBusiness(data.email, data.password, data.businessName);
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setApiError("That email is already registered. Try logging in instead.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      headline="Your first professional invoice is minutes away."
      tagline="Set up your business once, generate documents forever."
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
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
