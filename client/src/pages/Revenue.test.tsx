import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Revenue from "./Revenue";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockRevenue(overrides: Record<string, unknown> = {}) {
  return {
    invoicedThisMonth: 250000,
    invoicedLastMonth: 180000,
    invoicedYearToDate: 900000,
    creditedYearToDate: 50000,
    netYearToDate: 850000,
    totalCollected: 700000,
    totalOutstanding: 60000,
    daysSalesOutstanding: 12,
    monthlyRevenue: [
      { month: "2026-03", invoiced: 100000, credited: 0, net: 100000 },
      { month: "2026-04", invoiced: 120000, credited: 0, net: 120000 },
      { month: "2026-05", invoiced: 150000, credited: 20000, net: 130000 },
      { month: "2026-06", invoiced: 130000, credited: 0, net: 130000 },
      { month: "2026-07", invoiced: 180000, credited: 0, net: 180000 },
      { month: "2026-08", invoiced: 250000, credited: 30000, net: 220000 },
    ],
    topCustomers: [
      { customerId: "c1", name: "Acme Ltd", total: 500000 },
      { customerId: "c2", name: "Musanze Supplies", total: 350000 },
    ],
    ...overrides,
  };
}

function mockTaxSummary(overrides: Record<string, unknown> = {}) {
  return {
    totalTaxInvoiced: 18000,
    totalTaxCredited: 0,
    totalTaxCollected: 18000,
    byRate: [{ rate: 18, taxableAmount: 100000, taxAmount: 18000 }],
    ...overrides,
  };
}

function mockFetch(revenue: unknown, revenueStatus = 200, taxSummary: unknown = mockTaxSummary()) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.includes("/dashboard/revenue")) {
      return new Response(JSON.stringify(revenue), { status: revenueStatus });
    }
    if (url.includes("/reports/tax-summary")) {
      return new Response(JSON.stringify(taxSummary), { status: 200 });
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

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Revenue />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Revenue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the summary tiles once loaded", async () => {
    mockFetch(mockRevenue());

    renderPage();

    expect(await screen.findByText(/250,000 rwf/i)).toBeInTheDocument();
    expect(screen.getByText(/900,000 rwf/i)).toBeInTheDocument();
    expect(screen.getByText(/850,000 rwf/i)).toBeInTheDocument();
  });

  it("shows collected, outstanding, and days sales outstanding", async () => {
    mockFetch(mockRevenue());

    renderPage();

    expect(await screen.findByText(/700,000 rwf/i)).toBeInTheDocument();
    expect(screen.getByText(/60,000 rwf/i)).toBeInTheDocument();
    expect(screen.getByText("12 days")).toBeInTheDocument();
  });

  it("shows a fallback when there isn't enough data for days sales outstanding", async () => {
    mockFetch(mockRevenue({ daysSalesOutstanding: null }));

    renderPage();

    expect(await screen.findByText(/not enough data/i)).toBeInTheDocument();
  });

  it("lists top customers by net invoiced total", async () => {
    mockFetch(mockRevenue());

    renderPage();

    expect(await screen.findByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByText(/500,000 rwf/i)).toBeInTheDocument();
    expect(screen.getByText("Musanze Supplies")).toBeInTheDocument();
  });

  it("shows an empty state when there is no revenue yet", async () => {
    mockFetch(
      mockRevenue({
        invoicedThisMonth: 0,
        invoicedYearToDate: 0,
        creditedYearToDate: 0,
        netYearToDate: 0,
        monthlyRevenue: mockRevenue().monthlyRevenue.map((row: { month: string }) => ({
          month: row.month,
          invoiced: 0,
          credited: 0,
          net: 0,
        })),
        topCustomers: [],
      }),
    );

    renderPage();

    expect(await screen.findByText(/no revenue yet/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    mockFetch({}, 500);

    renderPage();

    expect(await screen.findByText(/couldn't load revenue/i)).toBeInTheDocument();
  });

  it("shows the tax summary with a rate breakdown", async () => {
    mockFetch(mockRevenue());

    renderPage();

    expect(await screen.findByText("18%")).toBeInTheDocument();
    expect(screen.getAllByText(/18,000 rwf/i).length).toBeGreaterThan(0);
  });

  it("reloads the tax summary when the date range changes", async () => {
    let lastTaxUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/dashboard/revenue")) {
        return new Response(JSON.stringify(mockRevenue()), { status: 200 });
      }
      if (url.includes("/reports/tax-summary")) {
        lastTaxUrl = url;
        return new Response(JSON.stringify(mockTaxSummary()), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();
    await screen.findByText("18%");

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-01-01" } });

    await screen.findByText("18%");
    expect(lastTaxUrl).toContain("from=2026-01-01");
  });
});
