import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiKeysSection } from "../components/business/ApiKeysSection";
import { WebhooksSection } from "../components/business/WebhooksSection";
import { Spinner } from "../components/Spinner";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../lib/apiClient";

const SECTIONS = [
  { id: "authentication", label: "Authentication" },
  { id: "errors", label: "Errors" },
  { id: "customers", label: "Customers" },
  { id: "items", label: "Items" },
  { id: "documents", label: "Documents" },
  { id: "webhooks", label: "Webhooks" },
  { id: "keys", label: "Your keys" },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-surface p-4 font-mono text-xs leading-relaxed text-neutral-800">
      <code>{children}</code>
    </pre>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-800">{children}</code>;
}

interface Endpoint {
  method: "GET" | "POST" | "PATCH";
  path: string;
  description: string;
}

function EndpointTable({ endpoints }: { endpoints: Endpoint[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full border-collapse font-sans text-sm">
        <tbody>
          {endpoints.map((endpoint) => (
            <tr key={`${endpoint.method} ${endpoint.path}`} className="border-b border-neutral-100 last:border-b-0">
              <td className="whitespace-nowrap px-4 py-2.5 align-top">
                <span className="rounded bg-primary-100 px-2 py-0.5 font-mono text-xs font-semibold text-primary-700">
                  {endpoint.method}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 align-top font-mono text-xs text-neutral-800">{endpoint.path}</td>
              <td className="px-4 py-2.5 text-neutral-600">{endpoint.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-2xl font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 font-sans text-sm leading-relaxed text-neutral-600">{children}</div>
    </section>
  );
}

const SIGNATURE_EXAMPLE = `import { createHmac, timingSafeEqual } from "node:crypto";

function isFromBilla(secret, rawBody, header) {
  const match = /^t=(\\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!match) return false;
  if (Math.abs(Date.now() / 1000 - Number(match[1])) > 300) return false;
  const expected = createHmac("sha256", secret).update(\`\${match[1]}.\${rawBody}\`).digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}`;

function KeyConsole() {
  const { user, business, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!user || !business || user.isAdmin) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-surface p-6">
        <p className="font-sans text-sm text-neutral-600">
          API keys and webhooks belong to a Billa business. Log in with the account that owns it to create them.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Start free trial
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="font-sans text-sm text-neutral-500">
        Signed in as {user.email}. Only the owner of {business.name} can create keys and webhooks.
      </p>
      <ApiKeysSection />
      <WebhooksSection />
    </div>
  );
}

export default function Developers() {
  const baseUrl = API_BASE_URL || (typeof window === "undefined" ? "" : window.location.origin);

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-page/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-sans text-xs font-medium text-neutral-600">
              Developers
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <Link to="/" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-12 px-6 py-16 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-28 flex flex-col gap-2.5">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="font-sans text-sm text-neutral-600 hover:text-neutral-900">
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-14">
          <div>
            <h1 className="font-display text-3xl font-semibold text-neutral-900">Build on Billa</h1>
            <p className="mt-3 max-w-2xl font-sans text-base text-neutral-600">
              Read and create customers, items and documents from your own software, and hear about new invoices and
              payments the moment they happen. Use it to connect Billa to accounting tools, point-of-sale systems or
              your own apps.
            </p>
            <CodeBlock>{`curl -H "Authorization: Bearer $BILLA_KEY" \\\n  "${baseUrl}/api/v1/customers?search=acme"`}</CodeBlock>
          </div>

          <Section id="authentication" title="Authentication">
            <p>
              Create a key below and send it on every request as <Code>Authorization: Bearer YOUR_KEY</Code>. A key
              belongs to one business and can do anything the API allows in it, so keep it out of public code. The
              full key is shown once, when you create it. Revoke it at any time and it stops working at once.
            </p>
            <p>
              Each business can have up to 10 active keys, and each key can make 120 requests a minute. The base
              address is <Code>{baseUrl}/api/v1</Code>.
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p>
              Errors come back as JSON with an <Code>error</Code> code. A <Code>400</Code> also lists what was wrong
              in <Code>details</Code>.
            </p>
            <ul className="list-disc pl-5">
              <li>
                <Code>401</Code> <Code>invalid_api_key</Code>: the key is missing, wrong or revoked.
              </li>
              <li>
                <Code>402</Code> <Code>subscription_required</Code>: the trial or subscription has ended. Reading still
                works, writing does not.
              </li>
              <li>
                <Code>404</Code> <Code>not_found</Code>: no such record, or that request is not part of the API.
              </li>
              <li>
                <Code>409</Code>: the request clashes with the record&apos;s state, for example editing a finalized document.
              </li>
            </ul>
          </Section>

          <Section id="customers" title="Customers">
            <EndpointTable
              endpoints={[
                { method: "GET", path: "/api/v1/customers", description: "List customers. Filter with search, page, pageSize and includeInactive." },
                { method: "GET", path: "/api/v1/customers/:id", description: "One customer." },
                { method: "POST", path: "/api/v1/customers", description: "Create a customer. Only name is required." },
                { method: "PATCH", path: "/api/v1/customers/:id", description: "Change a customer." },
              ]}
            />
            <CodeBlock>{`{
  "name": "Acme Ltd",
  "phone": "0788123456",
  "email": "accounts@acme.rw",
  "tin": "123456789",
  "address": "KG 7 Ave, Kigali"
}`}</CodeBlock>
          </Section>

          <Section id="items" title="Items">
            <EndpointTable
              endpoints={[
                { method: "GET", path: "/api/v1/items", description: "List items. Filter with search, category, page and pageSize." },
                { method: "POST", path: "/api/v1/items", description: "Create an item." },
                { method: "PATCH", path: "/api/v1/items/:id", description: "Change an item." },
              ]}
            />
            <CodeBlock>{`{
  "description": "Cement 50kg",
  "unitPrice": 12500,
  "unit": "bag",
  "taxRate": 18,
  "category": "Building"
}`}</CodeBlock>
            <p>Prices are whole Rwandan francs.</p>
          </Section>

          <Section id="documents" title="Documents">
            <EndpointTable
              endpoints={[
                { method: "GET", path: "/api/v1/documents", description: "List documents. Filter with type, status, search, page and pageSize." },
                { method: "GET", path: "/api/v1/documents/:id", description: "One document with its lines." },
                { method: "POST", path: "/api/v1/documents", description: "Create a draft." },
                { method: "PATCH", path: "/api/v1/documents/:id", description: "Change a draft." },
                { method: "POST", path: "/api/v1/documents/:id/finalize", description: "Give a draft its number and lock it." },
                { method: "POST", path: "/api/v1/documents/:id/payments", description: "Record a payment against a finalized invoice." },
                { method: "GET", path: "/api/v1/documents/:id/pdf", description: "Download the PDF." },
              ]}
            />
            <CodeBlock>{`{
  "type": "INVOICE",
  "customerId": "cl...",
  "issueDate": "2026-09-01",
  "dueDate": "2026-10-01",
  "lines": [
    { "description": "Cement 50kg", "quantity": 2, "unitPrice": 12500, "taxRate": 18 }
  ]
}`}</CodeBlock>
            <p>
              <Code>type</Code> is one of INVOICE, PROFORMA, DELIVERY_NOTE, QUOTE, RECEIPT or CREDIT_NOTE. Totals are
              worked out by Billa, so never send them. A payment looks like this:
            </p>
            <CodeBlock>{`{ "amount": 5000, "method": "BANK_TRANSFER", "paidOn": "2026-09-02", "referenceNumber": "TX-1029" }`}</CodeBlock>
            <p>
              <Code>method</Code> is CASH, BANK_TRANSFER, MOBILE_MONEY, CHEQUE or OTHER, and the amount cannot be more
              than what is still owed. Deleting, write-offs, imports, exports and settings are not part of the API.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>
              Have Billa call a URL of yours when something happens. The address must start with{" "}
              <Code>https://</Code> and be reachable from the internet, and each business can have up to 5.
            </p>
            <ul className="list-disc pl-5">
              <li>
                <Code>document.finalized</Code>: any document gets its number and is locked.
              </li>
              <li>
                <Code>payment.received</Code>: a payment is recorded, by hand or through MoMo.
              </li>
            </ul>
            <CodeBlock>{`{
  "id": "delivery id",
  "event": "payment.received",
  "createdAt": "2026-09-02T09:30:00.000Z",
  "data": {
    "id": "payment id",
    "documentId": "invoice id",
    "invoiceNumber": "INV-0001",
    "amount": 5000,
    "method": "BANK_TRANSFER",
    "paidOn": "2026-09-02",
    "referenceNumber": null
  }
}`}</CodeBlock>
            <p>
              Answer with any <Code>2xx</Code> status within 8 seconds. Anything else is tried again, up to 5 times in
              all, and a redirect counts as a failure. The same event can arrive twice, so use the delivery{" "}
              <Code>id</Code> to ignore repeats.
            </p>
            <h3 className="mt-2 font-display text-lg font-semibold text-neutral-900">Checking the signature</h3>
            <p>
              Every call carries <Code>Billa-Signature: t=TIME,v1=HEX</Code>. The <Code>v1</Code> value is an
              HMAC-SHA256 of <Code>TIME.BODY</Code>, keyed with the signing secret shown when you add the webhook.
              Reject a call that does not match or is more than 5 minutes old, and use the body exactly as received.
            </p>
            <CodeBlock>{SIGNATURE_EXAMPLE}</CodeBlock>
          </Section>

          <Section id="keys" title="Your keys">
            <p>Create and manage your API keys and webhooks here.</p>
            <KeyConsole />
          </Section>
        </div>
      </main>
    </div>
  );
}
