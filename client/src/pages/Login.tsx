import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setApiError(null);
    try {
      await login(data.email, data.password);
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setApiError("That email or password doesn't match our records.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      headline="Run your business on paper that means business."
      tagline="Invoices, quotes, and receipts your customers actually trust."
    >
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Log in</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        New to Billa?{" "}
        <Link to="/register" className="font-medium text-primary-500 hover:text-primary-700">
          Create an account
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
