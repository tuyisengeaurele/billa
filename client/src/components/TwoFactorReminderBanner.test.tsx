import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { TwoFactorReminderBanner } from "./TwoFactorReminderBanner";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockMe(totpEnabled: boolean) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com", totpEnabled },
          business: { id: "b1", name: "Kigali Traders" },
          impersonating: false,
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 401 });
  });
}

describe("TwoFactorReminderBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows nothing once two-factor is already enabled", async () => {
    mockMe(true);

    render(
      <MemoryRouter>
        <AuthProvider>
          <TwoFactorReminderBanner />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("nudges a user without two-factor to set it up in settings", async () => {
    mockMe(false);

    render(
      <MemoryRouter>
        <AuthProvider>
          <TwoFactorReminderBanner />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/add two-factor authentication/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /set up now/i })).toHaveAttribute("href", "/settings");
  });

  it("stops showing for the rest of the session once dismissed", async () => {
    mockMe(false);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <TwoFactorReminderBanner />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /dismiss/i }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(sessionStorage.getItem("billa:2fa-reminder-dismissed")).toBe("1");
  });
});
