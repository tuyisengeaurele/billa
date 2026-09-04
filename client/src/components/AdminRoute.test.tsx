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

  it("renders the admin route for an admin", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", email: "admin@example.com", isAdmin: true },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      ),
    );

    renderWithProviders("/admin/users");

    await waitFor(() => expect(screen.getByText("admin users page")).toBeInTheDocument());
  });
});
