import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Dashboard from "./Dashboard";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
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
    mockFetch({ draftCount: 0, overdueInvoiceCount: 0, recentDocuments: [] });

    renderDashboard();

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });

  it("shows a quick action link for every document type", async () => {
    mockFetch({ draftCount: 0, overdueInvoiceCount: 0, recentDocuments: [] });

    renderDashboard();
    await screen.findByText(/welcome/i);

    expect(screen.getByRole("link", { name: "New invoice" })).toHaveAttribute("href", "/documents/new?type=INVOICE");
    expect(screen.getByRole("link", { name: "New quote" })).toHaveAttribute("href", "/documents/new?type=QUOTE");
  });

  it("shows attention cards when there are drafts and overdue invoices", async () => {
    mockFetch({
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
    });

    renderDashboard();

    expect(await screen.findByText(/2 drafts waiting to be finalized/i)).toBeInTheDocument();
    expect(screen.getByText(/1 invoice past due date/i)).toBeInTheDocument();
  });

  it("hides attention cards when there is nothing to flag", async () => {
    mockFetch({
      draftCount: 0,
      overdueInvoiceCount: 0,
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
    });

    renderDashboard();
    await screen.findByText("Musanze Supplies");

    expect(screen.queryByText(/waiting to be finalized/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past due date/i)).not.toBeInTheDocument();
  });

  it("shows recent documents linking to the finalized view or the draft editor", async () => {
    mockFetch({
      draftCount: 1,
      overdueInvoiceCount: 0,
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
    });

    renderDashboard();

    expect(await screen.findByText("Musanze Supplies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /INV-0001/i })).toHaveAttribute("href", "/documents/d1");
    expect(screen.getByRole("link", { name: /Huye Traders/i })).toHaveAttribute("href", "/documents/d2/edit");
  });

  it("shows the empty state when the business has no documents yet", async () => {
    mockFetch({ draftCount: 0, overdueInvoiceCount: 0, recentDocuments: [] });

    renderDashboard();

    expect(await screen.findByText(/haven't created any documents yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first invoice/i })).toHaveAttribute(
      "href",
      "/documents/new?type=INVOICE",
    );
  });

  it("shows an error message when the dashboard fails to load", async () => {
    mockFetch({ error: "server_error" }, 500);

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your dashboard/i);
  });
});
