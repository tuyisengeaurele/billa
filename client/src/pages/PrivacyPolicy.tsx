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

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy policy" updated="August 23, 2026">
      <p className="font-sans text-sm leading-relaxed text-neutral-600">
        This policy explains what information Billa collects when you use the service, why, and how you can control
        it. Billa is built for small businesses in Rwanda, and this policy is written in plain language rather than
        dense legal text.
      </p>

      <Section title="What we collect">
        <p>When you create an account, we collect your email address and the business details you provide: name, TIN, industry, phone, address, and RRA EBM number if you add one.</p>
        <p>
          As you use Billa, we store the customers, items, and documents (invoices, proforma invoices, delivery
          notes, quotes, and receipts) you create. This data belongs to your business, not to Billa.
        </p>
        <p>
          If you sign in with Google, we receive your name and email address from Google. We never see or store your
          Google password.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          We use your data to run the product: generating documents, calculating totals, keeping your numbering
          sequences correct, and managing your subscription and trial period.
        </p>
        <p>
          If you choose to email a document to a customer from within Billa, we send that email (with the document
          attached) using Resend, our email delivery provider. We don't email your customers for any other reason.
        </p>
        <p>We don't sell your data, and we don't use it for advertising.</p>
      </Section>

      <Section title="Who processes it">
        <ul className="list-disc pl-5">
          <li>Firebase Authentication (Google) handles sign-in and password storage.</li>
          <li>Our database provider stores your business, customer, item, and document records.</li>
          <li>Flutterwave processes subscription payments made by Mobile Money or card. Billa never sees or stores your card or Mobile Money details directly.</li>
          <li>Resend delivers transactional emails, including documents you choose to send to customers.</li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data for as long as your account is active. If your trial or subscription lapses, your
          existing documents remain viewable and downloadable, but you can't create new ones until you subscribe
          again.
        </p>
        <p>If you'd like your account and data deleted, contact us and we'll remove it.</p>
      </Section>

      <Section title="Cookies">
        <p>
          Billa uses a single session cookie to keep you signed in. We don't use tracking or advertising cookies.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can review, correct, or export your business data at any time from within the app. You can request a
          full copy or deletion of your data by contacting us.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If this policy changes in a meaningful way, we'll update the date at the top of this page and let active
          subscribers know.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
