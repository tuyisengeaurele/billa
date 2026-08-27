import { render, screen, within } from "@testing-library/react";
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
          <Route path="/dashboard" element={<div>dashboard page</div>} />
          <Route path="/admin/users" element={<div>users list page</div>} />
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

    expect(await screen.findByRole("link", { name: "Kigali Traders" })).toHaveAttribute(
      "href",
      "/admin/businesses/biz1",
    );
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

  it("extends the trial when the button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2/extend-trial") && init?.method === "POST") {
        return new Response(JSON.stringify({ trialEndsAt: "2026-10-01T00:00:00.000Z" }), { status: 200 });
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

    await screen.findByRole("button", { name: /extend trial/i });
    await user.click(screen.getByRole("button", { name: /extend trial/i }));

    expect(await screen.findByText(new Date("2026-10-01T00:00:00.000Z").toLocaleDateString())).toBeInTheDocument();
  });

  it("suspends the account after confirming in the modal", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2/suspend") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              suspendedAt: null,
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

    await user.click(await screen.findByRole("button", { name: /^suspend$/i }));
    const dialog = await screen.findByRole("dialog", { name: /suspend account/i });
    await user.click(within(dialog).getByRole("button", { name: /^suspend$/i }));

    expect(await screen.findByRole("button", { name: /^reinstate$/i })).toBeInTheDocument();
    expect(screen.getByText(/suspended since/i)).toBeInTheDocument();
  });

  it("reinstates a suspended account", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2/reinstate") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              suspendedAt: "2026-08-20T00:00:00.000Z",
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

    await user.click(await screen.findByRole("button", { name: /^reinstate$/i }));

    expect(await screen.findByRole("button", { name: /^suspend$/i })).toBeInTheDocument();
    expect(screen.queryByText(/suspended since/i)).not.toBeInTheDocument();
  });

  it("disables the suspend button when viewing your own account", async () => {
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
              suspendedAt: null,
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

    expect(await screen.findByRole("button", { name: /^suspend$/i })).toBeDisabled();
  });

  it("requests, auto-approves, and enters the app when the button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests") && init?.method === "POST") {
        return new Response(JSON.stringify({ request: { id: "req1", status: "PENDING" } }), { status: 201 });
      }
      if (url.endsWith("/impersonation-requests/req1")) {
        return new Response(JSON.stringify({ status: "APPROVED" }), { status: 200 });
      }
      if (url.endsWith("/impersonation-requests/req1/redeem") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              suspendedAt: null,
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

    await user.click(await screen.findByRole("button", { name: /^impersonate$/i }));

    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });

  it("shows a denial and an override option once the request expires", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests") && init?.method === "POST") {
        return new Response(JSON.stringify({ request: { id: "req1", status: "PENDING" } }), { status: 201 });
      }
      if (url.endsWith("/impersonation-requests/req1")) {
        return new Response(JSON.stringify({ status: "EXPIRED" }), { status: 200 });
      }
      if (url.endsWith("/impersonation-requests/req1/override") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              suspendedAt: null,
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

    await user.click(await screen.findByRole("button", { name: /^impersonate$/i }));

    expect(await screen.findByText(/expired without a response/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/reason for overriding/i), "Customer locked out");
    await user.click(screen.getByRole("button", { name: /override and enter/i }));

    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });

  it("disables the impersonate button when viewing your own account", async () => {
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
              suspendedAt: null,
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

    expect(await screen.findByRole("button", { name: /^impersonate$/i })).toBeDisabled();
  });

  it("lists active sessions with a revoke button and revokes one when clicked", async () => {
    let revoked = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2/sessions/sess1/revoke") && init?.method === "POST") {
        revoked = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2/sessions")) {
        return new Response(
          JSON.stringify({
            results: revoked
              ? []
              : [{ id: "sess1", createdAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-09-19T00:00:00.000Z" }],
          }),
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
              suspendedAt: null,
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

    await user.click(await screen.findByRole("button", { name: /^revoke$/i }));

    expect(screen.queryByRole("button", { name: /^revoke$/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/no active sessions/i)).toBeInTheDocument();
  });

  it("requires typing the user's email before delete is enabled, then deletes and redirects", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: { id: "b1", name: "Admin Co" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/admin/users/u2") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/users/u2")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u2",
              email: "owner@example.com",
              isAdmin: false,
              suspendedAt: null,
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

    await user.click(await screen.findByRole("button", { name: /delete account/i }));
    const dialog = await screen.findByRole("dialog", { name: /delete account/i });
    const confirmButton = within(dialog).getByRole("button", { name: /^delete account$/i });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/type/i), "owner@example.com");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(await screen.findByText("users list page")).toBeInTheDocument();
  });

  it("disables the delete account button when viewing your own account", async () => {
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
              suspendedAt: null,
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

    expect(await screen.findByRole("button", { name: /delete account/i })).toBeDisabled();
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
