import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Login from "./Login";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("Login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the email field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true"));
  });

  it("navigates to /onboarding after a successful login", async () => {
    // /auth/me is called twice: once by AuthProvider's bootstrap (must be
    // 401, unauthenticated), once by login() itself right after a
    // successful /auth/login to fetch the business (must succeed). A
    // call counter distinguishes the two.
    let authMeCalls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        authMeCalls += 1;
        if (authMeCalls === 1) return new Response("{}", { status: 401 });
        return new Response(JSON.stringify({ business: { id: "b1", name: "Kigali Traders" } }), {
          status: 200,
        });
      }
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ user: { id: "u1", email: "owner@example.com" } }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner on invalid credentials", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/doesn't match our records/i)).toBeInTheDocument();
  });
});
