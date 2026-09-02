import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import * as clipboardModule from "../lib/clipboard";
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
