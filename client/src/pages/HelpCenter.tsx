import { Link } from "react-router-dom";
import { formatRwf, PLAN_PRICES } from "@billa/shared";
import { FaqItem } from "../components/FaqItem";

interface FaqGroup {
  category: string;
  items: { question: string; answer: string }[];
}

const GROUPS: FaqGroup[] = [
  {
    category: "Getting started",
    items: [
      {
        question: "What documents can I create?",
        answer:
          "Invoices, proforma invoices, delivery notes, quotes, and receipts, each with its own numbering sequence.",
      },
      {
        question: "How do I add my logo and business details?",
        answer:
          "Go to Settings after you sign in. Your business name, TIN, industry, contact details, and EBM number all appear on every document you create after that.",
      },
      {
        question: "Can I change what my documents look like?",
        answer:
          "Yes. Settings has two templates to choose from: Minimal and Premium. Your choice applies to every document you generate, and Premium also shows your bank details and an authorized signatory when you've added them.",
      },
      {
        question: "Can I use it for more than one business?",
        answer: "Yes. One account can manage up to three businesses, with one subscription covering all of them.",
      },
    ],
  },
  {
    category: "Documents",
    items: [
      {
        question: "What's the difference between a draft and a finalized document?",
        answer:
          "A draft can still be edited freely. Finalizing a document assigns it a permanent number and locks it, since a formal invoice or receipt shouldn't change after the fact.",
      },
      {
        question: "Can I edit a document after it's finalized?",
        answer:
          "No, finalized documents are locked. If something needs to change, create a new document. For proforma invoices, you can convert a finalized proforma into a new invoice in one click.",
      },
      {
        question: "Can I email a document straight to my customer?",
        answer:
          "Yes, from a finalized document's page you can send it by email as a PDF attachment, as long as the customer has an email address on file.",
      },
      {
        question: "Does Billa handle RRA EBM reporting?",
        answer:
          "Not yet. You can add your business's own EBM number so it appears on your invoices, but Billa doesn't connect to RRA's EBM system directly.",
      },
      {
        question: "Can a delivery note or receipt link to an invoice?",
        answer:
          "Yes. When creating a delivery note, you can optionally pick the invoice it's fulfilling, which fills in the same line items to start from. A receipt requires picking the invoice it's paying, since a receipt on its own isn't a valid record without one.",
      },
    ],
  },
  {
    category: "Billing and subscriptions",
    items: [
      {
        question: "What happens after my trial ends?",
        answer: `You can still view and download everything you've already created. Creating new documents will need an active subscription (planned at ${formatRwf(PLAN_PRICES.MONTHLY)} a month or ${formatRwf(PLAN_PRICES.ANNUAL)} a year) once paid plans go live.`,
      },
      {
        question: "How do I pay?",
        answer:
          "Paid subscriptions aren't open yet. Every account gets full access during the 14-day trial, and we'll announce payment options (Mobile Money and card) once they're live.",
      },
      {
        question: "Will my subscription renew automatically once payments are live?",
        answer:
          "No. Each payment will cover one billing period. When it ends, you choose whether to pay for another one; there's no automatic recurring charge.",
      },
    ],
  },
  {
    category: "Account and data",
    items: [
      {
        question: "Is my data backed up?",
        answer: "Yes, your business, customer, and document data is stored in a managed database with backups.",
      },
      {
        question: "Can I get my data deleted?",
        answer:
          "Yes. Go to Settings and use \"Delete my account\" in the Danger zone to remove your account and its data yourself, or contact us and we'll do it for you.",
      },
    ],
  },
];

export default function HelpCenter() {
  return (
    <div className="min-h-screen bg-page">
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

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">Help center</h1>
        <p className="mt-3 font-sans text-base text-neutral-600">
          Answers to the questions we hear most. Can't find yours?{" "}
          <Link to="/contact" className="font-medium text-primary-500 hover:text-primary-700">
            Contact us
          </Link>
          .
        </p>

        <div className="mt-12 flex flex-col gap-12">
          {GROUPS.map((group) => (
            <section key={group.category}>
              <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {group.category}
              </h2>
              <div className="mt-4 flex flex-col">
                {group.items.map((item) => (
                  <FaqItem key={item.question} question={item.question} answer={item.answer} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
