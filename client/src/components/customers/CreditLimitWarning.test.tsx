import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditLimitWarning } from "./CreditLimitWarning";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockCustomer(customer: Record<string, unknown>) {
  return vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ customer }), { status: 200 }));
}

describe("CreditLimitWarning", () => {
  it("warns when the invoice would take what they owe past the limit", async () => {
    mockCustomer({ name: "Acme Ltd", creditLimit: 400000, outstandingBalance: 320000 });

    render(<CreditLimitWarning customerId="c1" invoiceTotal={100000} />);

    expect(
      await screen.findByText(/acme ltd already owes 320,000 rwf\. with this invoice they would owe 420,000 rwf, which is over their 400,000 rwf limit/i),
    ).toBeInTheDocument();
  });

  it("stays quiet when they would still be within the limit", async () => {
    const fetchSpy = mockCustomer({ name: "Acme Ltd", creditLimit: 400000, outstandingBalance: 300000 });

    render(<CreditLimitWarning customerId="c1" invoiceTotal={100000} />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays quiet when the customer has no limit", async () => {
    const fetchSpy = mockCustomer({ name: "Acme Ltd", creditLimit: null, outstandingBalance: 9000000 });

    render(<CreditLimitWarning customerId="c1" invoiceTotal={100000} />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("updates as the invoice total changes", async () => {
    mockCustomer({ name: "Acme Ltd", creditLimit: 400000, outstandingBalance: 320000 });
    const { rerender } = render(<CreditLimitWarning customerId="c1" invoiceTotal={10000} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<CreditLimitWarning customerId="c1" invoiceTotal={100000} />);

    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("does nothing until a customer is chosen", () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    render(<CreditLimitWarning customerId="" invoiceTotal={100000} />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows nothing when the lookup fails", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(<CreditLimitWarning customerId="c1" invoiceTotal={100000} />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
