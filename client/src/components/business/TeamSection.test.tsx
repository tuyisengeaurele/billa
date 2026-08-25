import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { TeamSection } from "./TeamSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
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
    render(
      <AuthProvider>
        <TeamSection />
      </AuthProvider>,
    );

    expect(await screen.findByText("owner@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("staff@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/invite by email/i), "new@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => expect(inviteBody).toEqual({ email: "new@example.com" }));
    expect(await screen.findByText(/invite\/tok123/)).toBeInTheDocument();
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

    render(
      <AuthProvider>
        <TeamSection />
      </AuthProvider>,
    );

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
    render(
      <AuthProvider>
        <TeamSection />
      </AuthProvider>,
    );

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
    render(
      <AuthProvider>
        <TeamSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /^resend$/i }));

    expect(await screen.findByText(/invite sent/i)).toBeInTheDocument();
  });
});
