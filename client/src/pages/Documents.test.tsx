import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderAllDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents"]}>
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

  it("shows a payment status badge for an invoice", async () => {
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
                paymentStatus: "PARTIALLY_PAID",
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

    expect(await screen.findByText("Partially paid")).toBeInTheDocument();
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

  it("opens the PDF download URL when the row's download button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "d1",
              number: "INV-0001",
              status: "FINALIZED",
              issueDate: "2026-08-18T00:00:00.000Z",
              total: 5000,
              customer: { name: "Kigali Traders" },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    renderDocuments();

    await user.click(await screen.findByRole("button", { name: /download/i }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
  });

  it("shows a Type column and no New-document button in unified mode", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                type: "INVOICE",
                number: "INV-0001",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 5900,
                customer: { name: "Kigali Traders" },
              },
              {
                id: "d2",
                type: "PROFORMA",
                number: "PRO-0001",
                status: "FINALIZED",
                issueDate: "2026-08-18T00:00:00.000Z",
                total: 3000,
                customer: { name: "Musanze Supplies" },
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderAllDocuments();

    expect(await screen.findByText("invoice")).toBeInTheDocument();
    expect(screen.getByText("proforma invoice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^new /i })).not.toBeInTheDocument();
  });

  it("narrows results by type when a chip is toggled on", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      calls.push(url);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });
    const user = userEvent.setup();
    renderAllDocuments();
    await screen.findByText(/no documents yet/i);

    await user.click(screen.getByRole("button", { name: /^invoices$/i }));

    await waitFor(() => {
      const url = new URL(calls[calls.length - 1], "http://localhost");
      expect(url.searchParams.get("type")).toBe("INVOICE");
    });
  });

  it("adds to the type filter when a second chip is toggled on", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      calls.push(url);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });
    const user = userEvent.setup();
    renderAllDocuments();
    await screen.findByText(/no documents yet/i);

    await user.click(screen.getByRole("button", { name: /^invoices$/i }));
    await user.click(screen.getByRole("button", { name: /^proforma invoices$/i }));

    await waitFor(() => {
      const url = new URL(calls[calls.length - 1], "http://localhost");
      expect(url.searchParams.get("type")).toBe("INVOICE,PROFORMA");
    });
  });

  it("sends dateFrom and dateTo when the date range is set", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      calls.push(url);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-31" } });

    await waitFor(() => {
      const url = new URL(calls[calls.length - 1], "http://localhost");
      expect(url.searchParams.get("dateFrom")).toBe("2026-08-01");
      expect(url.searchParams.get("dateTo")).toBe("2026-08-31");
    });
  });

  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    expect(screen.getByLabelText("Search invoices")).toBeInTheDocument();
  });

  it("sorts by date when the Date header button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "d1",
              type: "INVOICE",
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
      ),
    );
    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText("INV-0001");

    await user.click(screen.getByRole("button", { name: /^date$/i }));

    expect(screen.getByRole("button", { name: /^date ↑$/i })).toBeInTheDocument();
  });

  it("navigates via the keyboard when Enter is pressed on a row", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "d1",
              type: "INVOICE",
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
      ),
    );
    const user = userEvent.setup();
    renderDocuments();

    const row = await screen.findByRole("button", { name: /view draft document/i });
    row.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("edit document page")).toBeInTheDocument());
  });
});
