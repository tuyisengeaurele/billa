import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function TestConsumer() {
  const { user, business, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  if (!user) return <div>unauthenticated</div>;
  return (
    <div>
      authenticated as {user.email} ({business?.name})
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
});
