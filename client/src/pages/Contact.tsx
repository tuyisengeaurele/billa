import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { contactMessageSchema, type ContactMessageInput } from "@billa/shared";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { apiRequest, ApiError } from "../lib/apiClient";

export default function Contact() {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactMessageInput>({ resolver: zodResolver(contactMessageSchema) });

  async function onSubmit(data: ContactMessageInput) {
    setApiError(null);
    try {
      await apiRequest("/contact", { method: "POST", body: data });
      setIsSent(true);
      reset();
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't send your message. Try again." : "Something went wrong. Try again.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
          </Link>
          <Link to="/" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">Contact us</h1>
        <p className="mt-3 font-sans text-base text-neutral-600">
          Questions, feedback, or something not working the way it should? Send us a message and we'll get back to
          you.
        </p>

        {isSent ? (
          <div className="mt-8 rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success" role="status">
            Thanks, we've got your message and will get back to you soon.
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
            {apiError && (
              <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
                {apiError}
              </div>
            )}
            <FormField id="name" label="Name" type="text" error={errors.name?.message} {...register("name")} />
            <FormField id="email" label="Email" type="email" error={errors.email?.message} {...register("email")} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="message" className="font-sans text-sm font-medium text-neutral-800">
                Message
              </label>
              <textarea
                id="message"
                rows={5}
                aria-invalid={errors.message ? "true" : "false"}
                className={`w-full resize-none rounded-lg border px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
                  errors.message ? "border-error" : "border-neutral-200"
                }`}
                {...register("message")}
              />
              {errors.message && (
                <p className="font-sans text-sm text-error" role="alert">
                  {errors.message.message}
                </p>
              )}
            </div>
            <Button type="submit" isLoading={isSubmitting}>
              Send message
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
