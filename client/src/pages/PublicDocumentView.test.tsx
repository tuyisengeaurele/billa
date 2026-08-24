import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicDocumentView from "./PublicDocumentView";

function renderPage(token = "tok-abc123") {
  return render(
    <MemoryRouter initialEntries={[`/view/${token}`]}>
      <Routes>
        <Route path="/view/:token" element={<PublicDocumentView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicDocumentView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the document, business, customer, lines, and totals", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [{ id: "l1", description: "Printing", quantity: "2.00", unitPrice: 5000, lineTotal: 10000 }],
            subtotal: 10000,
            taxTotal: 1800,
            total: 11800,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage();

    expect(await screen.findByText(/invoice inv-0001/i)).toBeInTheDocument();
    expect(screen.getByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByText(/acme ltd/i)).toBeInTheDocument();
    expect(screen.getByText("Printing")).toBeInTheDocument();
    expect(screen.getByText(/total: 11,800 rwf/i)).toBeInTheDocument();
  });

  it("links the download button to the public pdf endpoint", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage("tok-abc123");

    const link = await screen.findByRole("link", { name: /download pdf/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/public/documents/tok-abc123/pdf"));
  });

  it("shows a not-found message for an invalid or missing token", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify({}), { status: 404 }));

    renderPage("bad-token");

    expect(await screen.findByText(/isn't valid, or the document is no longer available/i)).toBeInTheDocument();
  });
});
