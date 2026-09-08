import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("shows the customer reference when present", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            customerReference: "PO-4821",
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage();

    expect(await screen.findByText(/reference: po-4821/i)).toBeInTheDocument();
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

  it("offers to accept an unconverted proforma", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "PROFORMA",
            number: "PRO-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            accepted: false,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage("tok-abc123");

    expect(await screen.findByRole("button", { name: /accept this proforma/i })).toBeInTheDocument();
  });

  it("does not offer to accept an invoice", async () => {
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
            accepted: false,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage("tok-abc123");

    await screen.findByText(/invoice inv-0001/i);
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("does not offer to accept an already-accepted proforma, and shows confirmation instead", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "PROFORMA",
            number: "PRO-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            accepted: true,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage("tok-abc123");

    expect(await screen.findByText(/you accepted this proforma/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept this proforma/i })).not.toBeInTheDocument();
  });

  it("accepts a proforma and shows a confirmation", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/accept")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ accepted: true }), { status: 201 });
      }
      return new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "PROFORMA",
            number: "PRO-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            accepted: false,
          },
        }),
        { status: 200 },
      );
    });

    renderPage("tok-abc123");

    const button = await screen.findByRole("button", { name: /accept this proforma/i });
    fireEvent.click(button);

    expect(await screen.findByText(/you accepted this proforma/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/public/documents/tok-abc123/accept"), expect.any(Object));
  });

  it("offers to accept or decline an unconverted quote", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "QUOTE",
            number: "QUO-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            accepted: false,
            declined: false,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage("tok-abc123");

    expect(await screen.findByRole("button", { name: /accept this quote/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("declines a quote and shows a confirmation", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/decline")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ declined: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "QUOTE",
            number: "QUO-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            accepted: false,
            declined: false,
          },
        }),
        { status: 200 },
      );
    });

    renderPage("tok-abc123");

    const button = await screen.findByRole("button", { name: /decline/i });
    fireEvent.click(button);

    expect(await screen.findByText(/you declined this quote/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/public/documents/tok-abc123/decline"), expect.any(Object));
  });

  it("does not offer accept or decline for an already-declined proforma", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "PROFORMA",
            number: "PRO-0001",
            business: { name: "Kigali Traders" },
            customer: { name: "Acme Ltd" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            accepted: false,
            declined: true,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage("tok-abc123");

    expect(await screen.findByText(/you declined this proforma/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /decline/i })).not.toBeInTheDocument();
  });

  describe("MTN MoMo payment", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    function invoiceWithMomo(overrides: Record<string, unknown> = {}) {
      return {
        id: "d1",
        type: "INVOICE",
        number: "INV-0001",
        business: { name: "Kigali Traders", momoEnabled: true },
        customer: { name: "Acme Ltd", phone: "+250788000000" },
        lines: [],
        subtotal: 0,
        taxTotal: 0,
        total: 10000,
        amountPaid: 0,
        paymentStatus: "UNPAID",
        ...overrides,
      };
    }

    it("submits a phone number and shows the pending state", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/momo/request/")) {
          return new Response(JSON.stringify({ status: "PENDING" }), { status: 200 });
        }
        if (url.endsWith("/momo/request")) {
          return new Response(JSON.stringify({ requestId: "req1" }), { status: 201 });
        }
        return new Response(JSON.stringify({ document: invoiceWithMomo() }), { status: 200 });
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderPage("tok-abc123");

      const phoneInput = await screen.findByLabelText(/mtn momo phone number/i);
      expect(phoneInput).toHaveValue("+250788000000");

      await user.click(screen.getByRole("button", { name: /pay 10,000 rwf with mtn momo/i }));

      expect(await screen.findByText(/check your phone to approve/i)).toBeInTheDocument();
    });

    it("shows a success message once MTN confirms the payment", async () => {
      let statusCalls = 0;
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/momo/request/")) {
          statusCalls += 1;
          return new Response(JSON.stringify({ status: statusCalls < 2 ? "PENDING" : "SUCCESSFUL" }), { status: 200 });
        }
        if (url.endsWith("/momo/request")) {
          return new Response(JSON.stringify({ requestId: "req1" }), { status: 201 });
        }
        return new Response(JSON.stringify({ document: invoiceWithMomo() }), { status: 200 });
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderPage("tok-abc123");
      await user.click(await screen.findByRole("button", { name: /pay 10,000 rwf with mtn momo/i }));
      await screen.findByText(/check your phone to approve/i);

      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(3000);

      expect(await screen.findByText(/payment received/i)).toBeInTheDocument();
    });

    it("shows a failure message and offers to try again", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/momo/request/")) {
          return new Response(JSON.stringify({ status: "FAILED", failureReason: "Payer rejected" }), { status: 200 });
        }
        if (url.endsWith("/momo/request")) {
          return new Response(JSON.stringify({ requestId: "req1" }), { status: 201 });
        }
        return new Response(JSON.stringify({ document: invoiceWithMomo() }), { status: 200 });
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderPage("tok-abc123");
      await user.click(await screen.findByRole("button", { name: /pay 10,000 rwf with mtn momo/i }));
      await vi.advanceTimersByTimeAsync(3000);

      expect(await screen.findByText("Payer rejected")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("does not show the MoMo section when the business hasn't enabled it", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify({ document: invoiceWithMomo({ business: { name: "Kigali Traders", momoEnabled: false } }) }), { status: 200 }),
      );

      renderPage("tok-abc123");

      await screen.findByText(/invoice inv-0001/i);
      expect(screen.queryByText(/pay with mtn momo/i)).not.toBeInTheDocument();
    });

    it("does not show the MoMo section once the invoice is fully paid", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify({ document: invoiceWithMomo({ amountPaid: 10000, paymentStatus: "PAID" }) }), { status: 200 }),
      );

      renderPage("tok-abc123");

      await screen.findByText(/invoice inv-0001/i);
      expect(screen.queryByText(/pay with mtn momo/i)).not.toBeInTheDocument();
    });
  });
});
