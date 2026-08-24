import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import DocumentView from "./DocumentView";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("DocumentView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the document number, customer, lines, and totals", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders" },
            lines: [{ id: "l1", description: "Printing", quantity: "2.00", unitPrice: 5000, lineTotal: 10000 }],
            subtotal: 10000,
            taxTotal: 1800,
            total: 11800,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByText("Printing")).toBeInTheDocument();
    expect(screen.getByText(/total: 11,800 rwf/i)).toBeInTheDocument();
  });

  it("opens the PDF download URL when the button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /download pdf/i }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
  });

  it("converts a finalized proforma to a draft invoice", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1/convert") && init?.method === "POST") {
        return new Response(JSON.stringify({ document: { id: "new-invoice-id" } }), { status: 201 });
      }
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "PROFORMA",
              number: "PRO-0001",
              status: "FINALIZED",
              customer: { name: "Kigali Traders" },
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
              convertedFrom: null,
              convertedTo: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
            <Route path="/documents/:id/edit" element={<div>edit invoice page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /convert to invoice/i }));

    const dialog = await screen.findByRole("dialog", { name: /convert to invoice/i });
    await user.click(within(dialog).getByRole("button", { name: /^convert$/i }));

    await waitFor(() => expect(screen.getByText("edit invoice page")).toBeInTheDocument());
  });

  it("shows a link instead of a button once the proforma has already been converted", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "PROFORMA",
              number: "PRO-0001",
              status: "FINALIZED",
              customer: { name: "Kigali Traders" },
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
              convertedFrom: null,
              convertedTo: { id: "inv1", number: "INV-0005" },
            },
          }),
          { status: 200 },
        ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/converted to invoice inv-0005/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /convert to invoice/i })).not.toBeInTheDocument();
  });

  it("shows a Converted from proforma link on an invoice created via conversion", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            document: {
              id: "inv1",
              type: "INVOICE",
              number: null,
              status: "DRAFT",
              customer: { name: "Kigali Traders" },
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
              convertedFrom: { id: "d1", number: "PRO-0001" },
              convertedTo: null,
            },
          }),
          { status: 200 },
        ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/inv1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/converted from proforma pro-0001/i)).toBeInTheDocument();
  });

  it("shows an error message when the document fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 500 }));

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load this document/i);
  });

  it("disables the send button and shows a hint when the customer has no email", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders", email: null },
            sentAt: null,
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /send by email/i })).toBeDisabled();
  });

  it("sends the document by email and shows a sent confirmation", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1/send") && init?.method === "POST") {
        return new Response(JSON.stringify({ sentAt: "2026-08-22T10:00:00.000Z" }), { status: 200 });
      }
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              number: "INV-0001",
              status: "FINALIZED",
              customer: { name: "Kigali Traders", email: "owner@acme.test" },
              sentAt: null,
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /send by email/i }));

    expect(await screen.findByText(/sent to owner@acme.test/i)).toBeInTheDocument();
  });

  it("shows an error message when sending fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1/send") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "email_send_failed" }), { status: 502 });
      }
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              number: "INV-0001",
              status: "FINALIZED",
              customer: { name: "Kigali Traders", email: "owner@acme.test" },
              sentAt: null,
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /send by email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send this document/i);
  });
});
