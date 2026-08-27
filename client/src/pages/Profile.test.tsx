import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Profile from "./Profile";

vi.mock("../lib/firebaseAuth", () => ({
  hasPasswordProvider: vi.fn(() => true),
  changePassword: vi.fn(),
}));

import { changePassword, hasPasswordProvider } from "../lib/firebaseAuth";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function baseUser(overrides: Partial<{ name: string | null; avatarUrl: string | null }> = {}) {
  return {
    id: "u1",
    email: "owner@example.com",
    name: overrides.name ?? "Ange Aurele",
    avatarUrl: overrides.avatarUrl ?? null,
    totpEnabled: false,
    isAdmin: false,
  };
}

function renderProfile(mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.spyOn(global, "fetch").mockImplementation(mock);
  return render(
    <AuthProvider>
      <Profile />
    </AuthProvider>,
  );
}

describe("Profile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the caller's name and email, and saves a new name", async () => {
    let patchedBody: unknown = null;
    const user = userEvent.setup();
    renderProfile(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: baseUser(), business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/profile/sessions")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.endsWith("/profile") && init?.method === "PATCH") {
        patchedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ user: baseUser({ name: "New Name" }) }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const nameField = await screen.findByLabelText(/^name$/i);
    expect(nameField).toHaveValue("Ange Aurele");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();

    await user.clear(nameField);
    await user.type(nameField, "New Name");
    await user.click(screen.getByRole("button", { name: /save name/i }));

    await waitFor(() => expect(patchedBody).toEqual({ name: "New Name" }));
    expect(await screen.findByText(/^saved\.$/i)).toBeInTheDocument();
  });

  it("uploads a new avatar", async () => {
    const user = userEvent.setup();
    let avatarUploaded = false;
    renderProfile(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: avatarUploaded ? baseUser({ avatarUrl: "/uploads/u1/avatar.png" }) : baseUser(),
            business: { id: "b1", name: "Kigali Traders" },
            impersonating: false,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/profile/sessions")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.endsWith("/profile/avatar") && init?.method === "POST") {
        avatarUploaded = true;
        return new Response(JSON.stringify({ url: "/uploads/u1/avatar.png" }), { status: 201 });
      }
      return new Response("{}", { status: 401 });
    });

    await screen.findByLabelText(/^name$/i);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-image-bytes"], "avatar.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await waitFor(() => expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument());
  });

  it("shows the password form and changes the password when a password provider is present", async () => {
    vi.mocked(hasPasswordProvider).mockReturnValue(true);
    vi.mocked(changePassword).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderProfile(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: baseUser(), business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/profile/sessions")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    await user.type(await screen.findByLabelText(/current password/i), "oldpass123");
    await user.type(screen.getByLabelText(/^new password$/i), "newpass123");
    await user.type(screen.getByLabelText(/confirm new password/i), "newpass123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith("oldpass123", "newpass123"));
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
  });

  it("shows a Google sign-in message instead of the password form when there's no password provider", async () => {
    vi.mocked(hasPasswordProvider).mockReturnValue(false);
    renderProfile(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: baseUser(), business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/profile/sessions")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    expect(await screen.findByText(/sign in with google/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it("lists active sessions and revokes another one", async () => {
    let revoked = false;
    const user = userEvent.setup();
    renderProfile(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: baseUser(), business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/profile/sessions/sess2/revoke") && init?.method === "POST") {
        revoked = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/profile/sessions")) {
        return new Response(
          JSON.stringify({
            results: revoked
              ? [{ id: "sess1", createdAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-09-19T00:00:00.000Z", isCurrent: true }]
              : [
                  { id: "sess1", createdAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-09-19T00:00:00.000Z", isCurrent: true },
                  { id: "sess2", createdAt: "2026-08-21T00:00:00.000Z", expiresAt: "2026-09-20T00:00:00.000Z", isCurrent: false },
                ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    expect(await screen.findByText(/this device/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /^sign out$/i })).not.toBeInTheDocument());
  });

  it("signs out other sessions when the bulk action is clicked", async () => {
    let revokedOthers = false;
    const user = userEvent.setup();
    renderProfile(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: baseUser(), business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/profile/sessions/revoke-others") && init?.method === "POST") {
        revokedOthers = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/profile/sessions")) {
        return new Response(
          JSON.stringify({
            results: revokedOthers
              ? [{ id: "sess1", createdAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-09-19T00:00:00.000Z", isCurrent: true }]
              : [
                  { id: "sess1", createdAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-09-19T00:00:00.000Z", isCurrent: true },
                  { id: "sess2", createdAt: "2026-08-21T00:00:00.000Z", expiresAt: "2026-09-20T00:00:00.000Z", isCurrent: false },
                ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    await user.click(await screen.findByRole("button", { name: /sign out of other sessions/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /sign out of other sessions/i })).not.toBeInTheDocument(),
    );
  });
});
