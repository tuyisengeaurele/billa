import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { TeamSection } from "./TeamSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderTeamSection() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<TeamSection />} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("TeamSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the member list, pending invites, and lets the owner send a new invite", async () => {
    let inviteBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({
            members: [
              { id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" },
              { id: "u2", email: "staff@example.com", role: "member", joinedAt: "2026-01-02" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(JSON.stringify({ invites: [] }), { status: 200 });
      }
      if (url.endsWith("/business/invites") && init?.method === "POST") {
        inviteBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            invite: { id: "inv1", email: "new@example.com", expiresAt: "2026-02-01" },
            link: "http://localhost:5173/invite/tok123",
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    expect(await screen.findByText("owner@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("staff@example.com", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^impersonate$/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/invite by email/i), "new@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => expect(inviteBody).toEqual({ email: "new@example.com", role: "MEMBER" }));
    expect(await screen.findByText(/invite\/tok123/)).toBeInTheDocument();
  });

  it("sends the ACCOUNTANT role when selected before inviting", async () => {
    let inviteBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({
            members: [{ id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(JSON.stringify({ invites: [] }), { status: 200 });
      }
      if (url.endsWith("/business/invites") && init?.method === "POST") {
        inviteBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            invite: { id: "inv1", email: "new@example.com", role: "accountant", expiresAt: "2026-02-01" },
            link: "http://localhost:5173/invite/tok123",
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    await user.type(await screen.findByLabelText(/invite by email/i), "new@example.com");
    await user.selectOptions(screen.getByLabelText(/^role$/i), "accountant");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => expect(inviteBody).toEqual({ email: "new@example.com", role: "ACCOUNTANT" }));
  });

  it("changes a member's role between Member and Accountant", async () => {
    let roleBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({
            members: [
              { id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" },
              { id: "u2", email: "staff@example.com", role: "member", joinedAt: "2026-01-02" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites")) {
        return new Response(JSON.stringify({ invites: [] }), { status: 200 });
      }
      if (url.endsWith("/business/members/u2/role") && init?.method === "PATCH") {
        roleBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    await screen.findByLabelText(/role for staff@example.com/i);
    await user.selectOptions(screen.getByLabelText(/role for staff@example.com/i), "accountant");

    await waitFor(() => expect(roleBody).toEqual({ role: "ACCOUNTANT" }));
    expect(screen.getByLabelText(/role for staff@example.com/i)).toHaveValue("accountant");
  });

  it("shows a read-only message for a member instead of management controls", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members") || url.endsWith("/business/invites")) {
        return new Response(JSON.stringify({ error: "not_owner" }), { status: 403 });
      }
      return new Response("{}", { status: 401 });
    });

    renderTeamSection();

    expect(await screen.findByText(/only the business owner can manage/i)).toBeInTheDocument();
  });

  it("copies a pending invite's link", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({ members: [{ id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" }] }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            invites: [
              {
                id: "inv1",
                email: "friend@example.com",
                expiresAt: "2026-02-01",
                createdAt: "2026-01-01",
                link: "http://localhost:5173/invite/tok123",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    await user.click(await screen.findByRole("button", { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith("http://localhost:5173/invite/tok123");
    expect(await screen.findByRole("button", { name: /^copied$/i })).toBeInTheDocument();
  });

  it("resends a pending invite", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({ members: [{ id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" }] }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            invites: [
              {
                id: "inv1",
                email: "friend@example.com",
                expiresAt: "2026-02-01",
                createdAt: "2026-01-01",
                link: "http://localhost:5173/invite/tok123",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites/inv1/resend") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            invite: { id: "inv1", email: "friend@example.com", expiresAt: "2026-03-01" },
            link: "http://localhost:5173/invite/tok123",
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    await user.click(await screen.findByRole("button", { name: /^resend$/i }));

    expect(await screen.findByText(/invite sent/i)).toBeInTheDocument();
  });

  it("requests, auto-approves, and enters the app when a member is impersonated", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({
            members: [
              { id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" },
              { id: "u2", email: "staff@example.com", role: "member", joinedAt: "2026-01-02" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(JSON.stringify({ invites: [] }), { status: 200 });
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
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    await user.click(await screen.findByRole("button", { name: /^impersonate$/i }));

    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });

  it("shows a denial message when the member declines", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({
            members: [
              { id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" },
              { id: "u2", email: "staff@example.com", role: "member", joinedAt: "2026-01-02" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(JSON.stringify({ invites: [] }), { status: 200 });
      }
      if (url.endsWith("/impersonation-requests") && init?.method === "POST") {
        return new Response(JSON.stringify({ request: { id: "req1", status: "PENDING" } }), { status: 201 });
      }
      if (url.endsWith("/impersonation-requests/req1")) {
        return new Response(JSON.stringify({ status: "DENIED" }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderTeamSection();

    await user.click(await screen.findByRole("button", { name: /^impersonate$/i }));

    expect(await screen.findByText(/staff@example.com denied the request/i)).toBeInTheDocument();
  });
});
