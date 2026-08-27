import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Dashboard from "./Dashboard";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function baseActivity() {
  return Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    count: 0,
  }));
}

function baseByType() {
  return [
    { type: "INVOICE", count: 0 },
    { type: "PROFORMA", count: 0 },
    { type: "DELIVERY_NOTE", count: 0 },
    { type: "QUOTE", count: 0 },
    { type: "RECEIPT", count: 0 },
    { type: "CREDIT_NOTE", count: 0 },
  ];
}

function baseSummary(overrides: Record<string, unknown> = {}) {
  return {
    draftCount: 0,
    overdueInvoiceCount: 0,
    recentDocuments: [],
    documentsThisMonth: 0,
    documentsLastMonth: 0,
    documentsByType: baseByType(),
    activityByDay: baseActivity(),
    customerCount: 0,
    hasLogo: false,
    ...overrides,
  };
}

function mockFetch(summary: unknown, summaryStatus = 200) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.includes("/dashboard/summary")) {
      return new Response(JSON.stringify(summary), { status: summaryStatus });
    }
    if (url.includes("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 401 });
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a welcome message with the business name", async () => {
    mockFetch(baseSummary());

    renderDashboard();

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });

  it("shows a quick action card for every document type", async () => {
    mockFetch(baseSummary());

    renderDashboard();
    await screen.findByText(/welcome/i);

    expect(screen.getByRole("link", { name: /new invoice/i })).toHaveAttribute("href", "/documents/new?type=INVOICE");
    expect(screen.getByRole("link", { name: /new quote/i })).toHaveAttribute("href", "/documents/new?type=QUOTE");
  });

  it("sends reminders and shows a confirmation when 'Send reminders' is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/documents/overdue/send-reminders") && init?.method === "POST") {
        return new Response(JSON.stringify({ sent: [{ documentId: "d1" }, { documentId: "d2" }] }), { status: 200 });
      }
      if (url.includes("/dashboard/summary")) {
        return new Response(
          JSON.stringify(
            baseSummary({
              overdueInvoiceCount: 1,
              recentDocuments: [
                {
                  id: "d1",
                  type: "INVOICE",
                  number: "INV-0001",
                  status: "FINALIZED",
                  customerName: "Musanze Supplies",
                  issueDate: "2026-08-19",
                },
              ],
            }),
          ),
          { status: 200 },
        );
      }
      if (url.includes("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /send reminders/i }));

    expect(await screen.findByText(/sent 2 reminders/i)).toBeInTheDocument();
  });

  it("shows attention cards when there are drafts and overdue invoices", async () => {
    mockFetch(
      baseSummary({
        draftCount: 2,
        overdueInvoiceCount: 1,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText(/2 drafts waiting to be finalized/i)).toBeInTheDocument();
    expect(screen.getByText(/1 invoice past due date/i)).toBeInTheDocument();
  });

  it("hides attention cards when there is nothing to flag", async () => {
    mockFetch(
      baseSummary({
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();
    await screen.findByText("Musanze Supplies");

    expect(screen.queryByText(/waiting to be finalized/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past due date/i)).not.toBeInTheDocument();
  });

  it("shows recent documents linking to the finalized view or the draft editor", async () => {
    mockFetch(
      baseSummary({
        draftCount: 1,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
          {
            id: "d2",
            type: "QUOTE",
            number: null,
            status: "DRAFT",
            customerName: "Huye Traders",
            issueDate: "2026-08-18",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText("Musanze Supplies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /INV-0001/i })).toHaveAttribute("href", "/documents/d1");
    expect(screen.getByRole("link", { name: /Huye Traders/i })).toHaveAttribute("href", "/documents/d2/edit");
  });

  it("shows a payment status badge on a recent invoice", async () => {
    mockFetch(
      baseSummary({
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
            paymentStatus: "PAID",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText("Paid")).toBeInTheDocument();
  });

  it("shows the get-started checklist and skips the metrics section when the business has no documents yet", async () => {
    mockFetch(baseSummary());

    renderDashboard();

    expect(await screen.findByText(/get started/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first invoice/i })).toHaveAttribute(
      "href",
      "/documents/new?type=INVOICE",
    );
    expect(screen.queryByText(/documents this month/i)).not.toBeInTheDocument();
  });

  it("shows all checklist steps as not done when the business is brand new", async () => {
    mockFetch(baseSummary({ customerCount: 0, hasLogo: false }));

    renderDashboard();
    await screen.findByText(/get started/i);

    const logoItem = screen.getByText(/add your business logo/i).closest("a")!;
    const customerItem = screen.getByText(/add a customer/i).closest("a")!;
    expect(logoItem).toHaveAttribute("href", "/settings");
    expect(customerItem).toHaveAttribute("href", "/customers");
    expect(within(logoItem).queryByText(/done/i)).not.toBeInTheDocument();
    expect(within(customerItem).queryByText(/done/i)).not.toBeInTheDocument();
  });

  it("marks logo and customer checklist steps done once they exist", async () => {
    mockFetch(baseSummary({ customerCount: 1, hasLogo: true }));

    renderDashboard();
    await screen.findByText(/get started/i);

    const logoItem = screen.getByText(/add your business logo/i).closest("a")!;
    const customerItem = screen.getByText(/add a customer/i).closest("a")!;
    expect(within(logoItem).getByText(/done/i)).toBeInTheDocument();
    expect(within(customerItem).getByText(/done/i)).toBeInTheDocument();
  });

  it("shows an error message when the dashboard fails to load", async () => {
    mockFetch({ error: "server_error" }, 500);

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your dashboard/i);
  });

  it("shows the documents-this-month headline stat with a comparison to last month", async () => {
    mockFetch(
      baseSummary({
        documentsThisMonth: 5,
        documentsLastMonth: 2,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText(/3 more than last month/i)).toBeInTheDocument();
  });

  it("shows 'fewer' and 'same' comparisons correctly", async () => {
    mockFetch(
      baseSummary({
        documentsThisMonth: 1,
        documentsLastMonth: 4,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText(/3 fewer than last month/i)).toBeInTheDocument();
  });
});
