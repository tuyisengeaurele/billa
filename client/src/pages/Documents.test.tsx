import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Documents from "./Documents";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents?type=INVOICE"]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/new" element={<div>new document page</div>} />
          <Route path="/documents/:id/edit" element={<div>edit document page</div>} />
          <Route path="/documents/:id" element={<div>view document page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Documents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no invoices", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderDocuments();

    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it("renders a list of invoices with formatted totals", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                number: "INV-0001",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 5900,
                customer: { name: "Kigali Traders" },
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderDocuments();

    expect(await screen.findByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText("5,900 RWF")).toBeInTheDocument();
  });

  it("navigates to the edit form when a draft row is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                number: null,
                status: "DRAFT",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 0,
                customer: { name: "Kigali Traders" },
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderDocuments();
    await user.click(await screen.findByText("Draft"));

    await waitFor(() => expect(screen.getByText("edit document page")).toBeInTheDocument());
  });

  it("navigates to the new invoice form when 'New invoice' is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );

    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    await user.click(screen.getAllByRole("button", { name: /new invoice/i })[0]);

    await waitFor(() => expect(screen.getByText("new document page")).toBeInTheDocument());
  });
});
