import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function TestConsumer() {
  const {
    user,
    business,
    isLoading,
    impersonating,
    completeTwoFactorChallenge,
    stopImpersonating,
    refreshAuth,
    deleteAccount,
  } = useAuth();
  if (isLoading) return <div>loading</div>;
  if (!user) {
    return (
      <div>
        unauthenticated
        <button onClick={() => completeTwoFactorChallenge("challenge-1", "123456")}>Verify</button>
      </div>
    );
  }
  return (
    <div>
      authenticated as {user.email} ({business?.name})
      {impersonating && <span>impersonating</span>}
      <button onClick={() => stopImpersonating()}>Return to admin</button>
      <button onClick={() => refreshAuth()}>Refresh</button>
      <button onClick={() => deleteAccount()}>Delete account</button>
    </div>
  );
}

describe("AuthProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading, then unauthenticated when /auth/me returns 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("unauthenticated")).toBeInTheDocument());
  });

  it("shows authenticated state when /auth/me succeeds", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("authenticated as owner@example.com (Kigali Traders)")).toBeInTheDocument(),
    );
  });

  it("surfaces impersonating: true when /auth/me reports it", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
          impersonating: true,
        }),
        { status: 200 },
      ),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("impersonating")).toBeInTheDocument());
  });

  it("stopImpersonating calls the stop endpoint and clears impersonating", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/impersonate/stop")) {
        return new Response(
          JSON.stringify({
            user: { id: "admin1", email: "admin@example.com" },
            business: { id: "b2", name: "Admin Co" },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
          impersonating: true,
        }),
        { status: 200 },
      );
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("impersonating")).toBeInTheDocument());
    await user.click(screen.getByText("Return to admin"));

    await waitFor(() =>
      expect(screen.getByText("authenticated as admin@example.com (Admin Co)")).toBeInTheDocument(),
    );
    expect(screen.queryByText("impersonating")).not.toBeInTheDocument();
  });

  it("refreshAuth re-fetches /auth/me and picks up a session change (e.g. impersonation starting)", async () => {
    const user = userEvent.setup();
    let impersonating = false;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: impersonating ? "owner@example.com" : "admin@example.com" },
          business: { id: "b1", name: impersonating ? "Kigali Traders" : "Admin Co" },
          impersonating,
        }),
        { status: 200 },
      );
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("authenticated as admin@example.com (Admin Co)")).toBeInTheDocument(),
    );

    impersonating = true;
    await user.click(screen.getByText("Refresh"));

    await waitFor(() =>
      expect(screen.getByText("authenticated as owner@example.com (Kigali Traders)")).toBeInTheDocument(),
    );
    expect(screen.getByText("impersonating")).toBeInTheDocument();
  });

  it("deleteAccount calls the delete endpoint and clears the session", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/me") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      );
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("authenticated as owner@example.com (Kigali Traders)")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Delete account"));

    await waitFor(() => expect(screen.getByText("unauthenticated")).toBeInTheDocument());
  });

  it("completeTwoFactorChallenge signs the user in on a correct code", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      );
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("unauthenticated")).toBeInTheDocument());
    await user.click(screen.getByText("Verify"));

    await waitFor(() =>
      expect(screen.getByText("authenticated as owner@example.com (Kigali Traders)")).toBeInTheDocument(),
    );
  });
});
