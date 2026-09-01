import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { AppLayoutRoute } from "../components/AppLayoutRoute";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import DocumentForm from "./DocumentForm";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderNew() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={["/documents/new?type=INVOICE"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/new" element={<DocumentForm />} />
            <Route path="/documents/:id/edit" element={<DocumentForm />} />
            <Route path="/documents/:id" element={<div>view document page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

function renderNewForType(type: string) {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={[`/documents/new?type=${type}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/new" element={<DocumentForm />} />
            <Route path="/documents/:id/edit" element={<DocumentForm />} />
            <Route path="/documents/:id" element={<div>view document page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

function renderEdit(id: string) {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={[`/documents/${id}/edit`]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/new" element={<DocumentForm />} />
            <Route path="/documents/:id/edit" element={<DocumentForm />} />
            <Route path="/documents/:id" element={<div>view document page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

function renderEditWithLayout(id: string) {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={[`/documents/${id}/edit`]}>
        <AuthProvider>
          <Routes>
            <Route element={<AppLayoutRoute />}>
              <Route path="/documents/:id/edit" element={<DocumentForm />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("DocumentForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefills the line's tax rate from the selected catalog item", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items?")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "i1", description: "Exported goods", unitPrice: 5000, unit: "piece", taxRate: 0 }],
            total: 1,
            page: 1,
            pageSize: 10,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderNew();

    await user.click(screen.getByRole("button", { name: /add line/i }));
    expect(screen.getByLabelText("Tax rate")).toHaveValue(18);

    await user.type(screen.getByLabelText("Item"), "Exported");
    const option = await screen.findByText("Exported goods");
    await user.click(option);

    expect(screen.getByLabelText("Tax rate")).toHaveValue(0);
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

  it("applies a percentage discount to the live subtotal before tax", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderNew();

    await user.click(screen.getByRole("button", { name: /add line/i }));

    const quantityInput = screen.getByLabelText(/quantity/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, "1");
    const priceInput = screen.getByLabelText(/unit price/i);
    await user.clear(priceInput);
    await user.type(priceInput, "10000");

    await user.selectOptions(screen.getByLabelText(/discount type/i), "PERCENT");
    const discountInput = await screen.findByLabelText(/discount value/i);
    await user.clear(discountInput);
    await user.type(discountInput, "10");

    await waitFor(() => expect(screen.getByText(/subtotal: 9,000 rwf/i)).toBeInTheDocument());
  });

  it("warns before leaving once a field has been edited, but not on a pristine form", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderNew();

    function dispatchBeforeUnload(): boolean {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    expect(dispatchBeforeUnload()).toBe(false);

    await user.click(screen.getByRole("button", { name: /add line/i }));
    const quantityInput = screen.getByLabelText(/quantity/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, "2");

    expect(dispatchBeforeUnload()).toBe(true);
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
              type: "INVOICE",
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

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    // Save navigates to /documents/d1/edit, which remounts DocumentForm with isEditing=true;
    // the Finalize button only renders in edit mode, so its presence confirms the navigation worked.
    await waitFor(() => expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument());
    expect(await screen.findByText("Document created")).toBeInTheDocument();
  });

  it("sends recurrence in the payload when 'Make this recurring' is checked", async () => {
    let postBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.includes("/documents") && init?.method === "POST") {
        postBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ document: { id: "d1" } }), { status: 201 });
      }
      if (url.endsWith("/documents/d1") && init?.method !== "PATCH") {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
              recurrenceInterval: null,
              recurrenceEndDate: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNew();

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));

    await user.click(screen.getByLabelText(/make this recurring/i));
    await user.selectOptions(screen.getByLabelText("Repeats"), "QUARTERLY");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() =>
      expect(postBody).toMatchObject({ recurrence: { interval: "QUARTERLY" } }),
    );
  });

  it("defaults the document language to English and sends the selected language in the payload", async () => {
    let postBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.includes("/documents") && init?.method === "POST") {
        postBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ document: { id: "d1" } }), { status: 201 });
      }
      if (url.endsWith("/documents/d1") && init?.method !== "PATCH") {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
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

    expect(await screen.findByLabelText(/document language/i)).toHaveValue("EN");

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));

    await user.selectOptions(screen.getByLabelText(/document language/i), "FR");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(postBody).toMatchObject({ language: "FR" }));
  });

  it("sends a customerReference in the payload when filled in", async () => {
    let postBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.includes("/documents") && init?.method === "POST") {
        postBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ document: { id: "d1" } }), { status: 201 });
      }
      if (url.endsWith("/documents/d1") && init?.method !== "PATCH") {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              customerReference: null,
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

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));

    await user.type(screen.getByLabelText(/customer po/i), "PO-4821");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(postBody).toMatchObject({ customerReference: "PO-4821" }));
  });

  it("does not show the interval picker until 'Make this recurring' is checked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
    renderNew();

    expect(screen.queryByLabelText("Repeats")).not.toBeInTheDocument();
  });

  it("pre-fills recurrence when editing a document that already has it set", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
              recurrenceInterval: "WEEKLY",
              recurrenceEndDate: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderEdit("d1");

    expect(await screen.findByLabelText(/make this recurring/i)).toBeChecked();
    expect(screen.getByLabelText("Repeats")).toHaveValue("WEEKLY");
  });

  it("loads an existing draft for editing", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
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
              type: "INVOICE",
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

    const dialog = await screen.findByRole("dialog", { name: /finalize/i });
    await user.click(within(dialog).getByRole("button", { name: /finalize/i }));

    await waitFor(() => expect(screen.getByText("view document page")).toBeInTheDocument());
    expect(await screen.findByText("Document finalized")).toBeInTheDocument();
  });

  it("opens the PDF download URL for an existing draft", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
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

  it("hides the due date field for a delivery note", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
    renderNewForType("DELIVERY_NOTE");

    await screen.findByRole("button", { name: /save draft/i });
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/valid until/i)).not.toBeInTheDocument();
  });

  it("labels the due date field 'Valid until' for a quote", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
    renderNewForType("QUOTE");

    expect(await screen.findByLabelText("Valid until")).toBeInTheDocument();
  });

  it("shows a Converted from proforma link when editing a converted invoice", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
              convertedFrom: { id: "proforma1", number: "PRO-0001" },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderEdit("d1");

    expect(await screen.findByText(/converted from proforma pro-0001/i)).toBeInTheDocument();
  });

  it("uses the loaded document's type for labels instead of falling back to invoice", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "PROFORMA",
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

    renderEditWithLayout("d1");

    expect(
      await screen.findByRole("heading", { name: /proforma invoices.*edit proforma invoice/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Valid until")).toBeInTheDocument();
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });

  it("shows an error message when the document fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 500 }));

    renderEdit("d1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load this document/i);
  });

  it("shows an invoice picker for a delivery note and prefills its lines when one is chosen", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents?type=INVOICE")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "inv1", number: "INV-0001", customer: { name: "Acme Ltd" } }],
            total: 1,
            page: 1,
            pageSize: 100,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Acme Ltd", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.endsWith("/documents/inv1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "inv1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Acme Ltd" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [
                { id: "l1", itemId: null, description: "Cement", quantity: "5.00", unitPrice: 13000, taxRate: "18.00" },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNewForType("DELIVERY_NOTE");

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Acme");
    await user.click(await screen.findByText("Acme Ltd"));

    const select = await screen.findByLabelText(/invoice/i);
    await user.selectOptions(select, "inv1");

    expect(await screen.findByDisplayValue("Cement")).toBeInTheDocument();
    expect(screen.getByText(/subtotal: 65,000 rwf/i)).toBeInTheDocument();
  });

  it("also prefills lines for a receipt when an invoice is chosen", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents?type=INVOICE")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "inv1", number: "INV-0001", customer: { name: "Acme Ltd" } }],
            total: 1,
            page: 1,
            pageSize: 100,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Acme Ltd", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.endsWith("/documents/inv1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "inv1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Acme Ltd" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [
                { id: "l1", itemId: null, description: "Cement", quantity: "5.00", unitPrice: 13000, taxRate: "18.00" },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNewForType("RECEIPT");

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Acme");
    await user.click(await screen.findByText("Acme Ltd"));

    const select = await screen.findByLabelText(/invoice/i);
    await user.selectOptions(select, "inv1");

    expect(await screen.findByDisplayValue("Cement")).toBeInTheDocument();
  });

  it("allows saving a delivery note with no invoice chosen", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 100 }), { status: 200 }),
    );

    renderNewForType("DELIVERY_NOTE");

    expect(await screen.findByLabelText(/invoice/i)).toHaveValue("");
  });

  it("disables the invoice picker until a customer is chosen", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 100 }), { status: 200 }),
    );

    renderNewForType("DELIVERY_NOTE");

    const select = await screen.findByLabelText(/invoice/i);
    expect(select).toBeDisabled();
    expect(screen.getByText(/choose a customer first/i)).toBeInTheDocument();
  });

  it("requires choosing an invoice before saving a receipt", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents?type=INVOICE")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 100 }), { status: 200 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNewForType("RECEIPT");

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(await screen.findByText(/choose the invoice/i)).toBeInTheDocument();
  });

  it("requires choosing an invoice before saving a credit note", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents?type=INVOICE")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 100 }), { status: 200 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNewForType("CREDIT_NOTE");

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(await screen.findByText(/choose the invoice/i)).toBeInTheDocument();
  });

  it("shows a For invoice link when editing a receipt that references one", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents?type=INVOICE")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 100 }), { status: 200 });
      }
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "RECEIPT",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
              referencedDocument: { id: "inv1", number: "INV-0001" },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderEdit("d1");

    expect(await screen.findByText(/for invoice inv-0001/i)).toBeInTheDocument();
  });

  it("shows a subscription message when saving is blocked by a lapsed trial", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({ results: [{ id: "c1", name: "Kigali Traders", phone: null }], total: 1, page: 1, pageSize: 10 }),
          { status: 200 },
        );
      }
      if (url.includes("/documents") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNew();

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");
    await user.click(await screen.findByText("Kigali Traders"));

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(await screen.findByText(/trial has ended/i)).toBeInTheDocument();
  });
});
