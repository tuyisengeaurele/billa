import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicCustomerPortal from "./PublicCustomerPortal";

function renderPage(token = "portal-abc123") {
  return render(
    <MemoryRouter initialEntries={[`/portal/${token}`]}>
      <Routes>
        <Route path="/portal/:token" element={<PublicCustomerPortal />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicCustomerPortal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the customer's name and their documents", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          customer: { name: "Acme Ltd" },
          documents: [
            {
              id: "d1",
              type: "INVOICE",
              number: "INV-0001",
              status: "FINALIZED",
              issueDate: "2026-08-19T00:00:00.000Z",
              total: 100000,
              amountPaid: 40000,
              paymentStatus: "PARTIALLY_PAID",
              publicToken: "doc-token1",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    renderPage();

    expect(await screen.findByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText(/100,000 rwf/i)).toBeInTheDocument();
    expect(screen.getByText("Partially paid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/public/documents/doc-token1/pdf"),
    );
  });

  it("shows an empty state when there are no documents", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ customer: { name: "Acme Ltd" }, documents: [] }), { status: 200 }),
    );

    renderPage();

    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });

  it("shows a not-found message for an invalid token", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 404 }));

    renderPage("bad-token");

    expect(await screen.findByText(/isn't valid/i)).toBeInTheDocument();
  });
});
