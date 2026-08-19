import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import DocumentForm from "./DocumentForm";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={["/documents/new?type=INVOICE"]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents/new" element={<DocumentForm />} />
          <Route path="/documents/:id/edit" element={<DocumentForm />} />
          <Route path="/documents/:id" element={<div>view document page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderEdit(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/documents/${id}/edit`]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents/new" element={<DocumentForm />} />
          <Route path="/documents/:id/edit" element={<DocumentForm />} />
          <Route path="/documents/:id" element={<div>view document page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DocumentForm", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds and removes line items, updating the live total", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderNew();

    expect(screen.getByText(/subtotal: 0 rwf/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add line/i }));

    const quantityInput = screen.getByLabelText(/quantity/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, "2");
    const priceInput = screen.getByLabelText(/unit price/i);
    await user.clear(priceInput);
    await user.type(priceInput, "5000");

    await waitFor(() => expect(screen.getByText(/subtotal: 10,000 rwf/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /remove line 1/i }));
    expect(screen.getByText(/subtotal: 0 rwf/i)).toBeInTheDocument();
  });

  it("saves a new draft and navigates to its edit URL", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.includes("/documents") && init?.method === "POST") {
        return new Response(JSON.stringify({ document: { id: "d1" } }), { status: 201 });
      }
      if (url.endsWith("/documents/d1") && init?.method !== "PATCH") {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNew();

    const customerInput = screen.getByLabelText("Customer");
    await user.click(customerInput);
    await user.type(customerInput, "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    // Save navigates to /documents/d1/edit, which remounts DocumentForm with isEditing=true;
    // the Finalize button only renders in edit mode, so its presence confirms the navigation worked.
    await waitFor(() => expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument());
  });

  it("loads an existing draft for editing", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [{ id: "l1", itemId: null, description: "Printing", quantity: "2.00", unitPrice: 5000, taxRate: "18.00" }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderEdit("d1");

    expect(await screen.findByDisplayValue("Printing")).toBeInTheDocument();
    expect(screen.getByText(/subtotal: 10,000 rwf/i)).toBeInTheDocument();
  });

  it("finalizes a document after confirming and navigates to the view page", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1") && init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [{ id: "l1", itemId: null, description: "Printing", quantity: "1.00", unitPrice: 5000, taxRate: "18.00" }],
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/documents/d1/finalize") && init?.method === "POST") {
        return new Response(JSON.stringify({ document: { id: "d1", number: "INV-0001" } }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderEdit("d1");

    await screen.findByDisplayValue("Printing");
    await user.click(screen.getByRole("button", { name: /finalize/i }));

    await waitFor(() => expect(screen.getByText("view document page")).toBeInTheDocument());
  });

  it("opens the PDF download URL for an existing draft", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    renderEdit("d1");

    await user.click(await screen.findByRole("button", { name: /download pdf/i }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
  });
});
