import type { ReactNode } from "react";
import { LegalPageLayout } from "../components/legal/LegalPageLayout";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 font-sans text-sm leading-relaxed text-neutral-600">{children}</div>
    </section>
  );
}

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of service" updated="August 23, 2026">
      <p className="font-sans text-sm leading-relaxed text-neutral-600">
        These terms cover your use of Billa. By creating an account, you agree to them. They're written in plain
        language, but they're still the terms that apply to your use of the service.
      </p>

      <Section title="What Billa is">
        <p>
          Billa generates invoices, proforma invoices, delivery notes, quotes, and receipts for small businesses.
          It's a documents tool, not a bookkeeping or accounting platform, and it doesn't connect to RRA's EBM system
          directly. You can add your own EBM number so it appears on your documents, but Billa doesn't file or report
          anything to RRA on your behalf.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You're responsible for the accuracy of the business, customer, and document information you enter, and for
          keeping your account credentials secure. One account can manage up to three businesses under a single
          subscription.
        </p>
      </Section>

      <Section title="Trial and subscription">
        <p>
          New accounts get a 14-day free trial with full access to every feature. After the trial, you need an
          active monthly or annual subscription to create new documents. Documents you already created stay
          viewable and downloadable even if your subscription lapses.
        </p>
        <p>
          Subscriptions are paid through Flutterwave by Mobile Money or card. Payments are one-time per billing
          period, not an automatically recurring charge: your access extends by the period you paid for, and you
          choose when to pay again.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Don't use Billa to create fraudulent documents, misrepresent a business you don't own or operate, or
          otherwise abuse the service. We can suspend or close accounts that do.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          The business, customer, and document data you create belongs to you. You can export or download it at any
          time. See our privacy policy for how we handle it.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          Billa is provided as-is. We work to keep it reliable and accurate, but we don't guarantee it will be
          error-free or uninterrupted, and we're not responsible for tax, legal, or compliance decisions you make
          based on documents generated in Billa.
        </p>
      </Section>

      <Section title="Changes">
        <p>We may update these terms as the product changes. We'll update the date at the top of this page when we do.</p>
      </Section>
    </LegalPageLayout>
  );
}
