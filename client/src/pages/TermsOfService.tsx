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
    <LegalPageLayout title="Terms of service" updated="August 26, 2026">
      <p className="font-sans text-sm leading-relaxed text-neutral-600">
        These terms form a binding agreement between you and Billa ("we," "us") governing your use of the Billa
        service. By creating an account, you accept them. They're written in plain language, but they're still the
        terms that apply, and they're enforceable under the laws of the Republic of Rwanda.
      </p>

      <Section title="1. What Billa is">
        <p>
          Billa generates invoices, proforma invoices, delivery notes, quotes, and receipts for small businesses.
          It's a documents tool, not a bookkeeping or accounting platform, and it doesn't connect to RRA's EBM
          system directly. You can add your own EBM number so it appears on your documents, but Billa doesn't file
          or report anything to RRA on your behalf. You're responsible for meeting your own tax, invoicing, and
          record-keeping obligations under Rwandan law.
        </p>
      </Section>

      <Section title="2. Eligibility and your account">
        <p>
          You must be able to form a binding contract to use Billa, and you must provide accurate information about
          yourself and the business or businesses you register. You're responsible for the accuracy of the business,
          customer, and document information you enter, and for keeping your account credentials secure. One account
          can manage up to three businesses under a single subscription. You're responsible for all activity that
          happens under your account.
        </p>
      </Section>

      <Section title="3. Trial and subscription">
        <p>
          New accounts get a 14-day free trial with full access to every feature. After the trial, an active
          subscription will be required to create new documents; documents you already created stay viewable and
          downloadable regardless. Paid subscriptions are not yet available. We'll update this section, and notify
          active accounts, before introducing charges.
        </p>
        <p>
          When subscriptions launch, payment will cover one billing period at a time, not an automatically
          recurring charge: your access extends by the period you paid for, and you choose when to pay again. We'll
          publish the accepted payment methods and any refund terms at that time.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>
          Don't use Billa to create fraudulent or deceptive documents, misrepresent a business you don't own or
          operate, infringe anyone's rights, or otherwise abuse the service, attempt to disrupt it, or access it
          through means other than the interfaces we provide. We can suspend or close accounts that do, with or
          without notice, depending on severity.
        </p>
      </Section>

      <Section title="5. Ownership">
        <p>
          The business, customer, and document data you create belongs to you. You can export or download it at any
          time. See our privacy policy for how we handle it. Billa's own software, design, branding, and templates
          belong to us; using the service doesn't transfer any ownership of them to you, and you may not copy,
          resell, or reverse-engineer them outside of what's needed for your own ordinary use of the service.
        </p>
      </Section>

      <Section title="6. Termination">
        <p>
          You can stop using Billa and delete your account at any time from Settings, or by contacting us. We may
          suspend or terminate your access if you breach these terms, if required by law, or if we discontinue the
          service, in which case we'll give you reasonable notice where practical so you can export your data first.
        </p>
      </Section>

      <Section title="7. No warranty">
        <p>
          Billa is provided "as is" and "as available." We work to keep it reliable and accurate, but we don't
          guarantee it will be error-free, secure, or uninterrupted, and we're not responsible for tax, legal, or
          compliance decisions you make based on documents generated in Billa.
        </p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>
          To the fullest extent permitted under Rwandan law, Billa and its owners and operators aren't liable for
          any indirect, incidental, or consequential losses (including lost profits or lost data) arising from your
          use of the service. Where liability can't be excluded, our total liability to you for any claim arising
          from these terms or your use of Billa is limited to the amount you paid us in the 12 months before the
          claim arose, or 50,000 RWF if you haven't paid us anything.
        </p>
      </Section>

      <Section title="9. Indemnification">
        <p>
          You agree to cover reasonable costs and damages we incur from third-party claims arising from your misuse
          of the service, your violation of these terms, or content in documents you create, except where we caused
          the claim ourselves.
        </p>
      </Section>

      <Section title="10. Governing law and disputes">
        <p>
          These terms are governed by the laws of the Republic of Rwanda, without regard to conflict-of-law rules.
          Any dispute arising from these terms or your use of Billa that can't be resolved informally is subject to
          the exclusive jurisdiction of the competent courts of Rwanda.
        </p>
      </Section>

      <Section title="11. General">
        <p>
          If any part of these terms turns out to be unenforceable, the rest still applies. These terms, together
          with our privacy policy, are the entire agreement between you and us about using Billa, and replace any
          earlier understanding on the subject. We may update these terms as the product changes; we'll update the
          date at the top of this page when we do, and continued use after a change means you accept it.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>Questions about these terms? Reach us through the contact form linked at the bottom of every page.</p>
      </Section>
    </LegalPageLayout>
  );
}
