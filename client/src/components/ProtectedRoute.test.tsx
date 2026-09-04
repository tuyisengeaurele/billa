import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";

function renderWithProviders(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/admin" element={<div>admin page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<div>onboarding page</div>} />
            <Route path="/dashboard" element={<div>dashboard page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a spinner instead of a blank screen while the auth check is in flight", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));

    renderWithProviders("/dashboard");

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    renderWithProviders("/dashboard");

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });

  it("renders the protected route when authenticated and onboarding is complete", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: "2026-01-01T00:00:00.000Z" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/dashboard");

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });

  it("redirects to /onboarding when onboarding hasn't been completed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: null },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/dashboard");

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("does not redirect away from /onboarding itself", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: null },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/onboarding");

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("redirects an admin to /admin", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "admin@example.com", isAdmin: true },
          business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: "2026-01-01T00:00:00.000Z" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/dashboard");

    await waitFor(() => expect(screen.getByText("admin page")).toBeInTheDocument());
  });
});
