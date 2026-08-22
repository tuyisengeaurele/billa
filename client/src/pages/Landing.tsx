import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES, formatRwf, PLAN_PRICES } from "@billa/shared";
import { InvoicePreview } from "../components/landing/InvoicePreview";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

const STEPS = [
  {
    title: "Add your business once",
    description: "Your name, logo, TIN, and EBM number, saved for every document after.",
  },
  {
    title: "Create a document in seconds",
    description: "Pick a customer, add line items, and Billa handles the numbering and totals.",
  },
  {
    title: "Send or download a finished PDF",
    description: "Ready to email or print, formatted like it came from a design studio.",
  },
];

const FAQS = [
  {
    question: "What documents can I create?",
    answer: "Invoices, proforma invoices, delivery notes, quotes, and receipts, each with its own numbering sequence.",
  },
  {
    question: "Does Billa handle RRA EBM reporting?",
    answer:
      "Not yet. You can add your business's own EBM number so it appears on your invoices, but Billa doesn't connect to RRA's EBM system directly.",
  },
  {
    question: "What happens after my trial ends?",
    answer: `You can still view and download everything you've already created. To create new documents, subscribe for ${formatRwf(PLAN_PRICES.MONTHLY)} a month or ${formatRwf(PLAN_PRICES.ANNUAL)} a year.`,
  },
  {
    question: "Can I use it for more than one business?",
    answer: "Yes. One account can manage up to three businesses, with one subscription covering all of them.",
  },
  {
    question: "How do I pay?",
    answer: "By Mobile Money or card.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/login" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Start free trial
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-16 lg:flex-row lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex-1"
        >
          <p className="font-sans text-sm font-semibold uppercase tracking-[0.2em] text-primary-500">
            Documents for Rwandan businesses
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-neutral-900 lg:text-5xl">
            Stop building invoices by hand.
          </h1>
          <p className="mt-6 max-w-lg font-sans text-lg text-neutral-600">
            Billa creates professional invoices, proforma invoices, delivery notes, quotes, and receipts in Rwandan
            francs. Add your business once, then every document after that takes seconds.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              to="/register"
              className="rounded-lg bg-primary-500 px-6 py-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Start free trial
            </Link>
            <span className="font-sans text-sm text-neutral-500">14 days free. No card required.</span>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, rotate: -3 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="relative flex flex-1 items-center justify-center"
        >
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ backgroundImage: "radial-gradient(circle at 60% 40%, rgba(194,24,91,0.12) 0, transparent 55%)" }}
          />
          <InvoicePreview />
        </motion.div>
      </section>

      <section className="relative overflow-hidden bg-primary-500 px-6 py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.35) 0, transparent 40%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.2) 0, transparent 45%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="font-sans text-sm font-semibold uppercase tracking-[0.2em] text-primary-100">The problem</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white lg:text-4xl">
            Built for how Rwandan businesses actually invoice
          </h2>
          <p className="mt-6 font-sans text-lg text-primary-100">
            Most small businesses in Rwanda still write invoices in Word, Excel, or by hand. It works until a
            customer asks for something more formal, or you lose track of what you've already numbered. Billa gives
            every document a real sequence, RWF totals, and a design that looks considered, without asking you to
            learn accounting software you don't need.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24">
        <h2 className="font-display text-3xl font-semibold text-neutral-900">Every document your business sends</h2>
        <div className="mt-12 flex flex-col">
          {DOCUMENT_TYPES.map((type, index) => (
            <div
              key={type}
              className="flex flex-col gap-1 border-t border-neutral-200 py-6 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="font-display text-sm text-neutral-400">0{index + 1}</span>
              <h3 className="font-display text-xl font-semibold text-neutral-900 sm:w-48 sm:shrink-0">
                {DOCUMENT_TYPE_LABELS[type].plural}
              </h3>
              <p className="font-sans text-base text-neutral-600">{DOCUMENT_TYPE_LABELS[type].description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">
            From sign-up to your first invoice in three steps
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title}>
                <span className="font-display text-2xl font-semibold text-primary-500">{index + 1}</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-neutral-900">{step.title}</h3>
                <p className="mt-2 font-sans text-sm text-neutral-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">Simple pricing</h2>
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 p-8">
            <p className="font-sans text-sm font-semibold uppercase tracking-wide text-neutral-500">Monthly</p>
            <p className="mt-4 font-display text-4xl font-semibold text-neutral-900">
              {formatRwf(PLAN_PRICES.MONTHLY)}
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-500">per month</p>
          </div>
          <div className="rounded-2xl border border-primary-500 p-8">
            <p className="font-sans text-sm font-semibold uppercase tracking-wide text-primary-500">Annual</p>
            <p className="mt-4 font-display text-4xl font-semibold text-neutral-900">
              {formatRwf(PLAN_PRICES.ANNUAL)}
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-500">per year, two months free</p>
          </div>
        </div>
        <p className="mt-8 text-center font-sans text-sm text-neutral-500">
          Every plan starts with a 14-day free trial. No card required.
        </p>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">Questions</h2>
          <div className="mt-12 flex flex-col gap-8">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <h3 className="font-display text-lg font-semibold text-neutral-900">{faq.question}</h3>
                <p className="mt-2 font-sans text-sm text-neutral-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-3xl font-semibold text-neutral-900">Start your free trial</h2>
        <p className="mt-4 font-sans text-lg text-neutral-600">14 days free. No card required. No auto-renewal, ever.</p>
        <Link
          to="/register"
          className="mt-8 inline-block rounded-lg bg-primary-500 px-6 py-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Start free trial
        </Link>
      </section>

      <footer className="border-t border-neutral-100 px-6 py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-500">
              <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-display text-sm font-semibold text-neutral-900">Billa</span>
          </div>
          <p className="font-sans text-sm text-neutral-500">© 2026 Billa</p>
          <Link to="/login" className="font-sans text-sm text-neutral-500 hover:text-neutral-900">
            Log in
          </Link>
        </div>
      </footer>
    </div>
  );
}
