import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ActiveImpersonationBanner } from "./ActiveImpersonationBanner";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("ActiveImpersonationBanner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows nothing when nobody is impersonating this account", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u2", email: "staff@example.com" }, business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/active-for-me")) {
        return new Response(JSON.stringify({ active: null }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    render(
      <AuthProvider>
        <ActiveImpersonationBanner />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows who's viewing the account, and ends it when clicked", async () => {
    let ended = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u2", email: "staff@example.com" }, business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/active-for-me")) {
        return new Response(
          JSON.stringify({ active: ended ? null : { adminName: "admin@example.com" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/end-active") && init?.method === "POST") {
        ended = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ActiveImpersonationBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText(/admin@example.com is currently viewing your account/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /end this/i }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
