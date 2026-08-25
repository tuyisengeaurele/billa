import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import AcceptInvite from "./AcceptInvite";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage(token = "tok-abc123") {
  return render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AcceptInvite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts a logged-out visitor to log in or register", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/invites/tok-abc123")) {
        return new Response(
          JSON.stringify({
            email: "friend@example.com",
            businessName: "Kigali Traders",
            expired: false,
            alreadyAccepted: false,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/join kigali traders/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/register");
  });

  it("lets a logged-in matching user accept the invite and redirects to the dashboard", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "friend@example.com" },
            business: { id: "b1", name: "Friend's Own Biz" },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/invites/tok-abc123/accept")) {
        return new Response(
          JSON.stringify({ business: { id: "biz-owner", name: "Kigali Traders", onboardingCompletedAt: null } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/invites/tok-abc123")) {
        return new Response(
          JSON.stringify({
            email: "friend@example.com",
            businessName: "Kigali Traders",
            expired: false,
            alreadyAccepted: false,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /accept invite/i }));

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it("shows an expired message", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/invites/tok-abc123")) {
        return new Response(
          JSON.stringify({
            email: "friend@example.com",
            businessName: "Kigali Traders",
            expired: true,
            alreadyAccepted: false,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/this invite has expired/i)).toBeInTheDocument();
  });

  it("shows a not-found message for an invalid token", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      return new Response("{}", { status: 404 });
    });

    renderPage("bad-token");

    expect(await screen.findByText(/isn't valid, or has been revoked/i)).toBeInTheDocument();
  });
});
