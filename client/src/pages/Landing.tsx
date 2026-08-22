import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES, formatRwf, PLAN_PRICES } from "@billa/shared";
import { DocumentPreviewStack } from "../components/landing/DocumentPreviewStack";
import { FaqItem } from "../components/FaqItem";
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

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-transparent bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
              Features
            </a>
            <a href="#pricing" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
              Pricing
            </a>
            <a href="#faq" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-6">
            <Link to="/login" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-md"
            >
              Start free trial
            </Link>
          </div>
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
              className="rounded-lg bg-primary-500 px-6 py-3 font-sans text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg"
            >
              Start free trial
            </Link>
            <span className="font-sans text-sm text-neutral-500">14 days free, full access.</span>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="relative flex flex-1 items-center justify-center"
        >
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ backgroundImage: "radial-gradient(circle at 60% 40%, rgba(194,24,91,0.12) 0, transparent 55%)" }}
          />
          <DocumentPreviewStack />
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
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mx-auto max-w-3xl text-center"
        >
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
        </motion.div>
      </section>

      <section id="features" className="mx-auto max-w-4xl scroll-mt-24 px-6 py-24">
        <motion.h2
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="font-display text-3xl font-semibold text-neutral-900"
        >
          Every document your business sends
        </motion.h2>
        <div className="mt-12 flex flex-col">
          {DOCUMENT_TYPES.map((type, index) => (
            <motion.div
              key={type}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.6 }}
              variants={fadeUp}
              transition={{ duration: 0.5, delay: index * 0.06, ease: "easeOut" }}
              className="group flex flex-col gap-1 border-t border-neutral-200 py-6 transition-colors first:border-t-0 hover:bg-neutral-50 sm:flex-row sm:items-baseline sm:gap-6 sm:rounded-lg sm:px-4"
            >
              <span className="font-display text-sm text-neutral-400 transition-colors group-hover:text-primary-500">
                0{index + 1}
              </span>
              <h3 className="font-display text-xl font-semibold text-neutral-900 sm:w-48 sm:shrink-0">
                {DOCUMENT_TYPE_LABELS[type].plural}
              </h3>
              <p className="font-sans text-base text-neutral-600">{DOCUMENT_TYPE_LABELS[type].description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.6 }}
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center font-display text-3xl font-semibold text-neutral-900"
          >
            From sign-up to your first invoice in three steps
          </motion.h2>
          <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <motion.div
                key={step.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.6 }}
                variants={fadeUp}
                transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
                whileHover={{ y: -4 }}
                className="rounded-xl p-2 transition-shadow hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 font-display text-lg font-semibold text-primary-700">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-neutral-900">{step.title}</h3>
                <p className="mt-2 font-sans text-sm text-neutral-600">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-4xl scroll-mt-24 px-6 py-20">
        <motion.h2
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center font-display text-3xl font-semibold text-neutral-900"
        >
          Simple pricing
        </motion.h2>
        <p className="mx-auto mt-3 max-w-md text-center font-sans text-sm text-neutral-500">
          Every plan includes a 14-day free trial before you pay anything.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.6 }}
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            whileHover={{ y: -6 }}
            className="rounded-2xl border border-neutral-200 p-8 transition-shadow hover:shadow-xl"
          >
            <p className="font-sans text-sm font-semibold uppercase tracking-wide text-neutral-500">Monthly</p>
            <p className="mt-4 font-display text-4xl font-semibold text-neutral-900">
              {formatRwf(PLAN_PRICES.MONTHLY)}
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-500">per month</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.6 }}
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            whileHover={{ y: -6 }}
            className="relative rounded-2xl border-2 border-primary-500 p-8 shadow-md transition-shadow hover:shadow-xl"
          >
            <span className="absolute -top-3 right-8 rounded-full bg-primary-500 px-3 py-1 font-sans text-xs font-semibold text-white">
              Best value
            </span>
            <p className="font-sans text-sm font-semibold uppercase tracking-wide text-primary-500">Annual</p>
            <p className="mt-4 font-display text-4xl font-semibold text-neutral-900">
              {formatRwf(PLAN_PRICES.ANNUAL)}
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-500">per year, two months free</p>
          </motion.div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.6 }}
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center font-display text-3xl font-semibold text-neutral-900"
          >
            Questions
          </motion.h2>
          <div className="mt-10 flex flex-col">
            {FAQS.map((faq) => (
              <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.6 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="font-display text-3xl font-semibold text-neutral-900">Start your free trial</h2>
          <p className="mt-4 font-sans text-lg text-neutral-600">14 days free, full access from day one.</p>
          <Link
            to="/register"
            className="mt-8 inline-block rounded-lg bg-primary-500 px-6 py-3 font-sans text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg"
          >
            Start free trial
          </Link>
        </motion.div>
      </section>

      <footer className="relative overflow-hidden border-t border-neutral-100 bg-white px-6 pb-10 pt-20">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ backgroundImage: "radial-gradient(circle at 50% 0%, rgba(194,24,91,0.06) 0, transparent 60%)" }}
        />
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-10 gap-y-12 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
                <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
              </span>
              <span className="font-display text-base font-semibold text-neutral-900">Billa</span>
            </div>
            <p className="mt-4 max-w-[16rem] font-sans text-sm text-neutral-500">
              Professional invoices, proforma invoices, delivery notes, quotes, and receipts for Rwandan businesses.
            </p>
          </div>
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">Product</p>
            <ul className="mt-5 flex flex-col gap-3.5">
              <li>
                <a href="#features" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  FAQ
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">Company</p>
            <ul className="mt-5 flex flex-col gap-3.5">
              <li>
                <Link to="/help" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Help center
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link to="/contact" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Contact us
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">Account</p>
            <ul className="mt-5 flex flex-col gap-3.5">
              <li>
                <Link to="/login" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Log in
                </Link>
              </li>
              <li>
                <Link to="/register" className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  Start free trial
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-6xl border-t border-neutral-200 pt-8 text-center">
          <p className="font-sans text-sm text-neutral-500">© 2026 Billa.</p>
        </div>
      </footer>
    </div>
  );
}
