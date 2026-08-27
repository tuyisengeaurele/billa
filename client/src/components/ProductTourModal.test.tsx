import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ProductTourModal } from "./ProductTourModal";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockAuth(productTourSeenAt: string | null) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com", name: null, avatarUrl: null, totpEnabled: false, isAdmin: false, productTourSeenAt },
          business: { id: "b1", name: "Kigali Traders" },
          impersonating: false,
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/profile/tour-seen")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  });
}

describe("ProductTourModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the tour for a user who hasn't seen it", async () => {
    mockAuth(null);
    render(
      <AuthProvider>
        <ProductTourModal />
      </AuthProvider>,
    );

    expect(await screen.findByRole("dialog", { name: /welcome to billa/i })).toBeInTheDocument();
  });

  it("does not show the tour for a user who has already seen it", async () => {
    mockAuth("2026-08-01T00:00:00.000Z");
    render(
      <AuthProvider>
        <ProductTourModal />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("steps through and marks the tour seen on the last step", async () => {
    const fetchSpy = mockAuth(null);
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ProductTourModal />
      </AuthProvider>,
    );

    await screen.findByRole("dialog", { name: /welcome to billa/i });
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(await screen.findByRole("dialog", { name: /create your first document/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/profile/tour-seen"), expect.anything()),
    );
  });

  it("marks the tour seen when skipped", async () => {
    const fetchSpy = mockAuth(null);
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ProductTourModal />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /^skip$/i }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/profile/tour-seen"), expect.anything()),
    );
  });
});
