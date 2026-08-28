import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import Receivables from "./Receivables";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    number: "INV-0001",
    customerName: "Acme Ltd",
    total: 100000,
    amountOwed: 100000,
    dueDate: "2026-09-01",
    daysOverdue: 0,
    agingBucket: "current",
    ...overrides,
  };
}

function authMeResponse() {
  return new Response(
    JSON.stringify({
      user: { id: "u1", email: "owner@example.com" },
      business: { id: "b1", name: "Kigali Traders" },
    }),
    { status: 200 },
  );
}

function renderPage() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter>
        <AuthProvider>
          <Receivables />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("Receivables", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists outstanding invoices with their aging bucket", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/auth/me")) return authMeResponse();
      if (url.includes("/receivables")) {
        return new Response(JSON.stringify({ results: [baseRow()], total: 1 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("shows an empty state when nothing is outstanding", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/auth/me")) return authMeResponse();
      if (url.includes("/receivables")) {
        return new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/nothing outstanding/i)).toBeInTheDocument();
  });

  it("records a payment and refreshes the list", async () => {
    let paymentBody: unknown = null;
    let receivablesCallCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/auth/me")) return authMeResponse();
      if (url.includes("/documents/inv1/payments") && init?.method === "POST") {
        paymentBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ payment: { id: "p1" } }), { status: 201 });
      }
      if (url.includes("/receivables")) {
        receivablesCallCount += 1;
        return new Response(
          JSON.stringify({
            results: receivablesCallCount === 1 ? [baseRow()] : [],
            total: receivablesCallCount === 1 ? 1 : 0,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /record payment/i }));
    const paymentDialog = await screen.findByRole("dialog", { name: /record payment/i });
    await user.click(within(paymentDialog).getByRole("button", { name: /^record payment$/i }));

    await waitFor(() => expect(paymentBody).toMatchObject({ amount: 100000, method: "CASH" }));
    expect(await screen.findByText(/nothing outstanding/i)).toBeInTheDocument();
    expect(await screen.findByText("Payment recorded")).toBeInTheDocument();
  });

  it("writes off an invoice with a reason and refreshes the list", async () => {
    let writeOffBody: unknown = null;
    let receivablesCallCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/auth/me")) return authMeResponse();
      if (url.includes("/documents/inv1/write-off") && init?.method === "POST") {
        writeOffBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ document: { id: "inv1" } }), { status: 200 });
      }
      if (url.includes("/receivables")) {
        receivablesCallCount += 1;
        return new Response(
          JSON.stringify({
            results: receivablesCallCount === 1 ? [baseRow()] : [],
            total: receivablesCallCount === 1 ? 1 : 0,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /write off/i }));
    const writeOffDialog = await screen.findByRole("dialog", { name: /write off/i });
    await user.type(within(writeOffDialog).getByLabelText(/reason/i), "Customer unreachable");
    await user.click(within(writeOffDialog).getByRole("button", { name: /^write off$/i }));

    await waitFor(() => expect(writeOffBody).toEqual({ writeOffReason: "Customer unreachable" }));
    expect(await screen.findByText(/nothing outstanding/i)).toBeInTheDocument();
    expect(await screen.findByText("Invoice written off")).toBeInTheDocument();
  });
});
