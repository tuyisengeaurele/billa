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
    <LegalPageLayout title="Privacy policy" updated="September 8, 2026">
      <p className="font-sans text-sm leading-relaxed text-neutral-600">
        This policy explains what information Billa collects when you use the service, why, and how you can control
        it. Billa is built for small businesses in Rwanda, and this policy is written in plain language rather than
        dense legal text. It's intended to meet the standards of Rwanda's Law N° 058/2021 on the Protection of
        Personal Data and Privacy.
      </p>

      <Section title="What we collect">
        <p>
          When you create an account, we collect your email address and either a password (if you register directly)
          or your name and email from Google (if you sign in with Google). We collect the business details you
          provide: name, TIN, industry, phone, address, and RRA EBM number if you add one. If you add bank details or
          an authorized signatory so they appear on your documents, we store the bank name, account number, and
          signatory name and title you provide.
        </p>
        <p>
          As you use Billa, we store the customers, items, and documents (invoices, proforma invoices, delivery
          notes, quotes, and receipts) you create, including line items, totals, and any notes you add. This data
          belongs to your business, not to Billa.
        </p>
        <p>
          If you turn on two-factor authentication, we store the authentication secret needed to check your codes.
          It's encrypted at rest, separately from the rest of your data, and used only to verify the codes your
          authenticator app generates.
        </p>
        <p>
          If your business accepts Mobile Money payments through Billa, or if you pay for a Billa subscription, we
          collect the phone number the payment is sent to or from, and share it with MTN Mobile Money to process
          that one transaction. See "Who processes it" below.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          We use your data to run the product: generating documents, calculating totals, keeping your numbering
          sequences correct, and managing your account, trial, and subscription.
        </p>
        <p>
          If you choose to email a document to a customer from within Billa, we send that email (with the document
          attached) through Google's email servers. We don't email your customers for any other reason.
        </p>
        <p>We don't sell your data, and we don't use it for advertising.</p>
      </Section>

      <Section title="Who processes it">
        <ul className="list-disc pl-5">
          <li>Firebase Authentication (Google) handles sign-in and, for accounts that register directly, password storage. We never see or store your password ourselves.</li>
          <li>Our database provider stores your business, customer, item, and document records.</li>
          <li>Google (Gmail) delivers transactional emails, including documents you choose to send to customers.</li>
          <li>
            MTN Mobile Money processes Mobile Money payments: the ones your customers send to your business through
            Billa, and the ones you send us for your own Billa subscription. We pass MTN the phone number and amount
            needed for that one payment; we never see or store a Mobile Money PIN. If your business connects its own
            MTN Mobile Money merchant account to accept payments, we encrypt those credentials at rest and use them
            only to request payments on your behalf.
          </li>
        </ul>
        <p>
          Some of these providers process data on servers located outside Rwanda. We only work with providers that
          maintain reasonable security safeguards for the data they handle.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data for as long as your account is active. If your trial or subscription lapses, your
          existing documents remain viewable and downloadable, but you can't create new ones until you subscribe
          again.
        </p>
        <p>
          You can permanently delete your account and its data yourself at any time from Settings, or contact us
          and we'll do it for you.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Billa uses two session cookies to keep you signed in and to renew your session without asking you to log
          in again. We don't use tracking or advertising cookies.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can review, correct, or export your business data at any time from within the app. You have the right
          to request access to, correction of, or deletion of your personal data, and to object to or restrict how
          we process it. You can exercise any of these rights from Settings or by contacting us.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We use reasonable technical and organizational measures, including encrypted connections and access
          controls, to protect your data. No system is completely secure, and we can't guarantee absolute security.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If this policy changes in a meaningful way, we'll update the date at the top of this page and let active
          accounts know.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Reach us through the contact form linked at the bottom of every
          page.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
