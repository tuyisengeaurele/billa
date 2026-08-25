import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import AdminUserDetail from "./AdminUserDetail";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage(userId = "u2") {
  return render(
    <MemoryRouter initialEntries={[`/admin/users/${userId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/users/:id" element={<AdminUserDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AdminUserDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the user's account info and businesses", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              trialEndsAt: "2026-09-01T00:00:00.000Z",
              currentPeriodEnd: null,
              plan: null,
              createdAt: "2026-08-01T00:00:00.000Z",
            },
            ownedBusinesses: [{ id: "biz1", name: "Kigali Traders" }],
            memberBusinesses: [],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kigali Traders" })).toHaveAttribute("href", "/admin/businesses/biz1");
    expect(screen.getByRole("button", { name: /grant admin/i })).toBeInTheDocument();
  });

  it("grants admin when the button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2/toggle-admin") && init?.method === "POST") {
        return new Response(JSON.stringify({ user: { id: "u2", isAdmin: true } }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              trialEndsAt: "2026-09-01T00:00:00.000Z",
              currentPeriodEnd: null,
              plan: null,
              createdAt: "2026-08-01T00:00:00.000Z",
            },
            ownedBusinesses: [],
            memberBusinesses: [],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /grant admin/i }));

    expect(await screen.findByRole("button", { name: /revoke admin/i })).toBeInTheDocument();
  });

  it("disables the admin toggle when viewing your own account", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u1")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u1",
              email: "admin@example.com",
              isAdmin: true,
              trialEndsAt: "2026-09-01T00:00:00.000Z",
              currentPeriodEnd: null,
              plan: null,
              createdAt: "2026-08-01T00:00:00.000Z",
            },
            ownedBusinesses: [],
            memberBusinesses: [],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage("u1");

    expect(await screen.findByRole("button", { name: /revoke admin/i })).toBeDisabled();
  });

  it("shows a not-found message for an unknown user", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      return new Response("{}", { status: 404 });
    });

    renderPage("nonexistent");

    expect(await screen.findByText(/no user found/i)).toBeInTheDocument();
  });
});
