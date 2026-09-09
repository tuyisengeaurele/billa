import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { AdminRoute } from "./AdminRoute";

function renderWithProviders(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/admin/login" element={<div>admin login page</div>} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
          <Route element={<AdminRoute />}>
            <Route path="/admin/users" element={<div>admin users page</div>} />
            <Route path="/admin/profile" element={<div>admin profile page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AdminRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a spinner instead of a blank screen while the auth check is in flight", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));

    renderWithProviders("/admin/users");

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to /admin/login when unauthenticated", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    renderWithProviders("/admin/users");

    await waitFor(() => expect(screen.getByText("admin login page")).toBeInTheDocument());
  });

  it("redirects a non-admin to /dashboard", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com", isAdmin: false },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/admin/users");

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });

  it("renders the admin route for an admin with 2FA enabled", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "admin@example.com", isAdmin: true, totpEnabled: true },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/admin/users");

    await waitFor(() => expect(screen.getByText("admin users page")).toBeInTheDocument());
  });

  it("prompts an admin without 2FA to set it up, instead of showing the admin page", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "admin@example.com", isAdmin: true, totpEnabled: false },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/admin/users");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /two-factor authentication/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("admin users page")).not.toBeInTheDocument();
    // /admin/profile is the one admin route that must stay reachable without 2FA
    // yet - it's where an admin turns 2FA on in the first place.
    expect(screen.getByRole("link", { name: /go to your profile/i })).toHaveAttribute("href", "/admin/profile");
  });

  it("lets an admin without 2FA reach /admin/profile instead of bouncing them back to this same screen", async () => {
    // Regression test: /admin/profile is where the 2FA setup UI actually lives for
    // an admin (see Profile.tsx), so this route can't be gated on totpEnabled like
    // every other admin route - that would make the "go set it up" link a dead end
    // that loops back to itself.
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "admin@example.com", isAdmin: true, totpEnabled: false },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/admin/profile");

    await waitFor(() => expect(screen.getByText("admin profile page")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: /two-factor authentication/i })).not.toBeInTheDocument();
  });
});
