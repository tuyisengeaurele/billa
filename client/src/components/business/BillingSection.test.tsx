import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { BillingSection } from "./BillingSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

interface MockOverrides {
  status?: unknown;
  onPoll?: (call: number) => unknown;
}

function mockFetch(overrides: MockOverrides = {}) {
  let pollCalls = 0;
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com", phone: "+250788000000" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/billing/status") && method === "GET") {
      return new Response(
        JSON.stringify(
          overrides.status ?? {
            trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
            currentPeriodEnd: null,
            plan: null,
            activeUntil: new Date(Date.now() + 86400000).toISOString(),
          },
        ),
        { status: 200 },
      );
    }
    if (url.endsWith("/billing/checkout") && method === "POST") {
      return new Response(JSON.stringify({ paymentId: "pay1" }), { status: 201 });
    }
    if (url.includes("/billing/checkout/") && method === "GET") {
      pollCalls += 1;
      return new Response(JSON.stringify(overrides.onPoll ? overrides.onPoll(pollCalls) : { status: "PENDING" }), {
        status: 200,
      });
    }
    return new Response("{}", { status: 401 });
  });
}

describe("BillingSection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("pre-fills the phone number from the user's profile", async () => {
    mockFetch();

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await screen.findByLabelText(/mtn momo phone number/i);
    await waitFor(() => expect(screen.getByLabelText(/mtn momo phone number/i)).toHaveValue("+250788000000"));
  });

  it("submits a checkout and shows the pending state", async () => {
    mockFetch();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /pay 6,500 rwf \(monthly\)/i }));

    expect(await screen.findByText(/check your phone to approve/i)).toBeInTheDocument();
  });

  it("shows a success message once MTN confirms the payment", async () => {
    mockFetch({ onPoll: (call) => ({ status: call < 2 ? "PENDING" : "SUCCESSFUL" }) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /pay 6,500 rwf \(monthly\)/i }));
    await screen.findByText(/check your phone to approve/i);

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();
  });

  it("shows a failure message and offers to try again", async () => {
    mockFetch({ onPoll: () => ({ status: "FAILED", failureReason: "Payer rejected" }) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /pay 6,500 rwf \(monthly\)/i }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText("Payer rejected")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
