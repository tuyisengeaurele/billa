import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import AdminLogin from "./AdminLogin";

vi.mock("../lib/firebaseAuth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  consumeGoogleRedirectResult: vi.fn(),
  signOutFirebase: vi.fn(),
  resetPassword: vi.fn(),
  firebaseErrorCode: (err: unknown) =>
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : null,
}));

import { consumeGoogleRedirectResult, signInWithEmail, signInWithGoogle } from "../lib/firebaseAuth";

function renderAdminLogin(initialEntry = "/admin/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/users" element={<div>admin users page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("AdminLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a session-expired notice when redirected here with ?expired=true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderAdminLogin("/admin/login?expired=true");

    expect(await screen.findByText(/your session expired/i)).toBeInTheDocument();
  });

  it("does not show the session-expired notice on a plain visit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderAdminLogin();
    await screen.findByRole("button", { name: /log in/i });

    expect(screen.queryByText(/your session expired/i)).not.toBeInTheDocument();
  });

  it("logs an admin in and enters the admin area", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "admin@example.com", isAdmin: true },
            business: { id: "b1", name: "Admin Co" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderAdminLogin();

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("admin users page")).toBeInTheDocument());
  });

  it("sends the browser to Google when 'Continue with Google' is clicked", async () => {
    // Google sign-in is a full-page redirect, not a popup (see firebaseAuth.ts) -
    // there's nothing to await here beyond confirming the redirect was actually
    // triggered. The rest of the flow is covered by the "returning from Google"
    // test below.
    vi.mocked(signInWithGoogle).mockResolvedValue();
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderAdminLogin();

    await user.click(await screen.findByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it("enters the admin area on the load Google redirects back to, for an admin with no business", async () => {
    // Simulates landing back on /admin/login after signInWithGoogle() sent the
    // browser to Google and back - completeGoogleSignIn() picks this up on
    // mount. Admin-only accounts have no business at all (see auth.ts's
    // /session handler), which this confirms doesn't trip up the redirect path
    // the same way it doesn't trip up the popup one.
    vi.mocked(consumeGoogleRedirectResult).mockResolvedValue("fake-google-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "admin@example.com", isAdmin: true }, business: null }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderAdminLogin();

    await waitFor(() => expect(screen.getByText("admin users page")).toBeInTheDocument());
  });

  it("rejects a non-admin account with an error and signs them out", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u2", email: "owner@example.com", isAdmin: false },
            business: { id: "b2", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/auth/logout") && init?.method === "POST") {
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderAdminLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/doesn't have admin access/i)).toBeInTheDocument();
    expect(screen.queryByText("admin users page")).not.toBeInTheDocument();
  });

  it("shows an error banner on invalid credentials", async () => {
    vi.mocked(signInWithEmail).mockRejectedValue({ code: "auth/invalid-credential" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderAdminLogin();

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/doesn't match our records/i)).toBeInTheDocument();
  });

  it("tells the caller to wait instead of the generic error, when rate-limited", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/session")) {
        return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderAdminLogin();

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "adminpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("shows a clear message for an admin account with no linked business, instead of a generic error", async () => {
    // Regression test: this used to be an unhandled 500 from the server (see
    // auth.session.test.ts) - the client showed the same "Something went wrong"
    // as any other failure, with no hint of what was actually going on.
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/session")) {
        return new Response(JSON.stringify({ error: "no_business_access" }), { status: 403 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderAdminLogin();

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "adminpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't linked to a business/i);
  });

  it("shows a verification code step, then enters the admin area once verified", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      if (url.endsWith("/auth/session")) {
        return new Response(JSON.stringify({ twoFactorRequired: true, challengeId: "chal-1" }), { status: 200 });
      }
      if (url.endsWith("/auth/2fa/challenge")) {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if (body.code !== "123456") {
          return new Response(JSON.stringify({ error: "invalid_code" }), { status: 401 });
        }
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "admin@example.com", totpEnabled: true, isAdmin: true },
            business: { id: "b1", name: "Admin Co" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderAdminLogin();

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByText(/enter your code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(await screen.findByText("admin users page")).toBeInTheDocument();
  });
});
