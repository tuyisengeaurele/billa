import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ImpersonationRequestModal } from "./ImpersonationRequestModal";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("ImpersonationRequestModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows nothing when there's no pending request", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u2", email: "staff@example.com" }, business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/pending-for-me")) {
        return new Response(JSON.stringify({ request: null }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    render(
      <AuthProvider>
        <ImpersonationRequestModal />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the consent dialog and approves it", async () => {
    let approved = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u2", email: "staff@example.com" }, business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/pending-for-me")) {
        return new Response(
          JSON.stringify({
            request: approved ? null : { id: "req1", requesterName: "owner@example.com", reason: "support ticket" },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/req1/approve") && init?.method === "POST") {
        approved = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ImpersonationRequestModal />
      </AuthProvider>,
    );

    expect(await screen.findByText(/owner@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/support ticket/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^allow$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("denies the request when Deny is clicked", async () => {
    let denied = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u2", email: "staff@example.com" }, business: { id: "b1", name: "Kigali Traders" }, impersonating: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/pending-for-me")) {
        return new Response(
          JSON.stringify({
            request: denied ? null : { id: "req1", requesterName: "owner@example.com", reason: null },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/impersonation-requests/req1/deny") && init?.method === "POST") {
        denied = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ImpersonationRequestModal />
      </AuthProvider>,
    );

    await screen.findByText(/owner@example.com/);
    await user.click(screen.getByRole("button", { name: /^deny$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
