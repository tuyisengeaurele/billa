import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import Documents from "./Documents";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderDocuments() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={["/documents?type=INVOICE"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/new" element={<div>new document page</div>} />
            <Route path="/documents/:id/edit" element={<div>edit document page</div>} />
            <Route path="/documents/:id" element={<div>view document page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

function renderAllDocuments() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={["/documents"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/new" element={<div>new document page</div>} />
            <Route path="/documents/:id/edit" element={<div>edit document page</div>} />
            <Route path="/documents/:id" element={<div>view document page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("Documents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the sorted column header with aria-sort, flipping direction on repeat clicks", async () => {
    const user = userEvent.setup();
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
    await screen.findByText("INV-0001");

    const dateHeader = screen.getByRole("columnheader", { name: /date/i });
    const totalHeader = screen.getByRole("columnheader", { name: /total/i });
    expect(dateHeader).toHaveAttribute("aria-sort", "none");
    expect(totalHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /date/i }));
    expect(dateHeader).toHaveAttribute("aria-sort", "ascending");
    expect(totalHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /date/i }));
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: /total/i }));
    expect(dateHeader).toHaveAttribute("aria-sort", "none");
    expect(totalHeader).toHaveAttribute("aria-sort", "ascending");
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

  it("renders the document number as a real link, so it can be opened in a new tab", async () => {
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

    const link = await screen.findByRole("link", { name: "INV-0001" });
    expect(link).toHaveAttribute("href", "/documents/d1");
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

  it("shows a search-specific empty message instead of the generic one while searching", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    await user.type(screen.getByLabelText("Search invoices"), "zzz");

    expect(await screen.findByText('No invoices match "zzz".')).toBeInTheDocument();
    expect(screen.queryByText(/no invoices yet/i)).not.toBeInTheDocument();
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

  it("bulk-deletes selected drafts", async () => {
    let deletedIds: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (init?.method === "DELETE") {
        const id = url.split("/").pop()!;
        deletedIds.push(id);
        return new Response(null, { status: 204 });
      }
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                type: "INVOICE",
                number: null,
                status: "DRAFT",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 0,
                customer: { name: "Kigali Traders", email: null },
              },
              {
                id: "d2",
                type: "INVOICE",
                number: null,
                status: "DRAFT",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 0,
                customer: { name: "Acme Ltd", email: null },
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
    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    await user.click(screen.getByRole("button", { name: /delete drafts \(2\)/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(deletedIds.sort()).toEqual(["d1", "d2"]));
    expect(await screen.findByText(/2 drafts deleted/i)).toBeInTheDocument();
  });

  it("bulk-sends selected finalized documents in the chosen language", async () => {
    const sentIds: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/send") && init?.method === "POST") {
        sentIds.push(url.split("/documents/")[1]!.split("/send")[0]!);
        return new Response(JSON.stringify({ sentAt: "2026-09-02T00:00:00.000Z" }), { status: 200 });
      }
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
                number: "INV-0001",
                type: "INVOICE",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 5900,
                customer: { name: "Kigali Traders", email: "billing@kigali.rw" },
              },
              {
                id: "d2",
                number: "INV-0002",
                type: "INVOICE",
                status: "FINALIZED",
                issueDate: "2026-08-19T00:00:00.000Z",
                total: 5900,
                customer: { name: "Acme Ltd", email: "acme@example.com" },
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
    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    await user.click(screen.getByRole("button", { name: /send \(2\)/i }));
    await user.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() => expect(sentIds.sort()).toEqual(["d1", "d2"]));
    expect(await screen.findByText(/2 documents sent/i)).toBeInTheDocument();
  });
});
