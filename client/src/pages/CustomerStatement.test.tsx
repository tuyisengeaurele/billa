import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import * as clipboardModule from "../lib/clipboard";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import { AppLayoutRoute } from "../components/AppLayoutRoute";
import CustomerStatement from "./CustomerStatement";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage(id = "c1") {
  return render(
    <MemoryRouter initialEntries={[`/customers/${id}/statement`]}>
      <AuthProvider>
        <Routes>
          <Route path="/customers/:id/statement" element={<CustomerStatement />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderPageWithLayout(id = "c1") {
  return render(
    <MemoryRouter initialEntries={[`/customers/${id}/statement`]}>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayoutRoute />}>
            <Route path="/customers/:id/statement" element={<CustomerStatement />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("CustomerStatement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the customer's contact details and their documents", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: {
              id: "c1",
              name: "Acme Ltd",
              tin: "123456789",
              address: null,
              phone: "+250788000000",
              email: "acme@example.com",
              isActive: true,
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                type: "INVOICE",
                number: "INV-0001",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 17700,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 50,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPageWithLayout();

    expect(
      await screen.findByRole("heading", { name: /customers.*acme ltd/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("+250788000000")).toBeInTheDocument();
    expect(screen.getByText("TIN 123456789")).toBeInTheDocument();
    expect(await screen.findByText("INV-0001")).toBeInTheDocument();
    expect(screen.getAllByText(/17,700 rwf/i).length).toBeGreaterThan(0);
  });

  it("shows payment behavior stats when the customer has paid invoices", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: {
              id: "c1",
              name: "Acme Ltd",
              tin: null,
              address: null,
              phone: null,
              email: null,
              isActive: true,
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/customers/c1/payment-stats")) {
        return new Response(
          JSON.stringify({ paidInvoiceCount: 4, averageDaysToPay: 2, onTimeRate: 75 }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 50 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPageWithLayout();

    expect(await screen.findByText("Payment behavior")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2 days late on average")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("marks the sorted column header with aria-sort, flipping direction on repeat clicks", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: {
              id: "c1",
              name: "Acme Ltd",
              tin: "123456789",
              address: null,
              phone: "+250788000000",
              email: "acme@example.com",
              isActive: true,
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                type: "INVOICE",
                number: "INV-0001",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 17700,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 50,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPageWithLayout();
    await screen.findByText("INV-0001");

    const dateHeader = screen.getByRole("columnheader", { name: /date/i });
    const totalHeader = screen.getByRole("columnheader", { name: /total/i });
    // The list defaults to sorting by date, descending.
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");
    expect(totalHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /total/i }));
    expect(totalHeader).toHaveAttribute("aria-sort", "ascending");
    expect(dateHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /total/i }));
    expect(totalHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("shows the amount owed and payment status for a partially paid invoice", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: { id: "c1", name: "Acme Ltd", tin: null, address: null, phone: null, email: null, isActive: true },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                type: "INVOICE",
                number: "INV-0001",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 100000,
                amountPaid: 40000,
                paymentStatus: "PARTIALLY_PAID",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 50,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText("Partially paid")).toBeInTheDocument();
    expect(screen.getAllByText(/60,000 rwf/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/outstanding on this page: 60,000 rwf/i)).toBeInTheDocument();
  });

  it("does not count a draft invoice's total toward the outstanding total", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: { id: "c1", name: "Acme Ltd", tin: null, address: null, phone: null, email: null, isActive: true },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                type: "INVOICE",
                number: "INV-0001",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 50000,
                amountPaid: 0,
                paymentStatus: "UNPAID",
              },
              {
                id: "d2",
                type: "INVOICE",
                number: null,
                status: "DRAFT",
                issueDate: "2026-08-20T00:00:00.000Z",
                total: 200000,
                amountPaid: 0,
                paymentStatus: null,
              },
            ],
            total: 2,
            page: 1,
            pageSize: 50,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    await screen.findByText("INV-0001");

    // Only the finalized invoice's 50,000 owed should count, not the draft's 200,000 total.
    expect(screen.getByText(/outstanding on this page: 50,000 rwf/i)).toBeInTheDocument();
    expect(screen.queryByText(/outstanding on this page: 250,000 rwf/i)).not.toBeInTheDocument();

    const draftRow = screen.getByText("Draft").closest("tr")!;
    expect(draftRow).toHaveTextContent("N/A");
  });

  it("copies the customer portal link to the clipboard", async () => {
    const copySpy = vi.spyOn(clipboardModule, "copyToClipboard").mockResolvedValue(true);
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: {
              id: "c1",
              name: "Acme Ltd",
              tin: null,
              address: null,
              phone: null,
              email: null,
              isActive: true,
              portalToken: "portal-abc123",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 50 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /copy portal link/i }));

    expect(copySpy).toHaveBeenCalledWith(expect.stringContaining("/portal/portal-abc123"));
    expect(await screen.findByText(/portal link copied/i)).toBeInTheDocument();
  });

  describe("sending the statement", () => {
    function mockPage(customerOverrides: Record<string, unknown> = {}, onSend?: () => Response) {
      return vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        const url = urlOf(input);
        if (url.includes("/auth/me")) {
          return new Response(
            JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
            { status: 200 },
          );
        }
        if (url.endsWith("/send-statement") && init?.method === "POST") {
          return onSend
            ? onSend()
            : new Response(JSON.stringify({ sentTo: "acme@example.com", invoiceCount: 2, totalOwed: 52500 }), { status: 200 });
        }
        if (url.endsWith("/customers/c1")) {
          return new Response(
            JSON.stringify({
              customer: {
                id: "c1",
                name: "Acme Ltd",
                tin: null,
                address: null,
                phone: "0788123456",
                email: "acme@example.com",
                isActive: true,
                portalToken: "portal-abc123",
                outstandingBalance: 52500,
                ...customerOverrides,
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/documents?")) {
          return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 50 }), { status: 200 });
        }
        return new Response("{}", { status: 401 });
      });
    }

    function renderWithToasts() {
      return render(
        <ToastTestWrapper>
          <MemoryRouter initialEntries={["/customers/c1/statement"]}>
            <AuthProvider>
              <Routes>
                <Route path="/customers/:id/statement" element={<CustomerStatement />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </ToastTestWrapper>,
      );
    }

    it("emails the statement and confirms who it went to", async () => {
      const fetchSpy = mockPage();
      const user = userEvent.setup();
      renderWithToasts();

      await user.click(await screen.findByRole("button", { name: /email statement/i }));

      expect(await screen.findByText("Statement sent to acme@example.com")).toBeInTheDocument();
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) => urlOf(input).endsWith("/customers/c1/send-statement") && init?.method === "POST",
        ),
      ).toBe(true);
    });

    it("cannot email a customer with no email address", async () => {
      mockPage({ email: null });
      renderWithToasts();

      expect(await screen.findByRole("button", { name: /email statement/i })).toBeDisabled();
    });

    it("cannot send a statement to a customer who owes nothing", async () => {
      mockPage({ outstandingBalance: 0 });
      renderWithToasts();

      expect(await screen.findByRole("button", { name: /email statement/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /whatsapp statement/i })).toBeDisabled();
    });

    it("explains a failed send", async () => {
      mockPage({}, () => new Response(JSON.stringify({ error: "email_send_failed" }), { status: 502 }));
      const user = userEvent.setup();
      renderWithToasts();

      await user.click(await screen.findByRole("button", { name: /email statement/i }));

      expect(await screen.findByText(/couldn't send the statement/i)).toBeInTheDocument();
    });

    it("opens a WhatsApp message with the balance and the portal link", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      mockPage();
      const user = userEvent.setup();
      renderWithToasts();

      await user.click(await screen.findByRole("button", { name: /whatsapp statement/i }));

      const link = decodeURIComponent(String(open.mock.calls[0]![0]));
      expect(link).toContain("https://wa.me/250788123456?text=");
      expect(link).toContain("Hello Acme Ltd, this is your statement from Kigali Traders. You currently owe 52,500 RWF.");
      expect(link).toContain("/portal/portal-abc123");
    });
  });

  it("shows an empty state when the customer has no documents", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/c1")) {
        return new Response(
          JSON.stringify({
            customer: { id: "c1", name: "Acme Ltd", tin: null, address: null, phone: null, email: null, isActive: true },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 50 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/no documents for this customer yet/i)).toBeInTheDocument();
  });

  it("shows an error message when the customer fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load this customer/i);
  });
});
