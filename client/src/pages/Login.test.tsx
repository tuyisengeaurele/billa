import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Login from "./Login";

vi.mock("../lib/firebaseAuth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFirebase: vi.fn(),
  resetPassword: vi.fn(),
  firebaseErrorCode: (err: unknown) =>
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : null,
}));

import { resetPassword, signInWithEmail, signInWithGoogle } from "../lib/firebaseAuth";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
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
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
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

  it("navigates straight to the dashboard when onboarding is already complete", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: "2026-08-01T00:00:00.000Z" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<div>onboarding page</div>} />
            <Route path="/dashboard" element={<div>dashboard page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });

  it("shows an error banner on invalid credentials", async () => {
    vi.mocked(signInWithEmail).mockRejectedValue({ code: "auth/invalid-credential" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/doesn't match our records/i)).toBeInTheDocument();
  });

  it("signs in with Google and navigates to /onboarding", async () => {
    vi.mocked(signInWithGoogle).mockResolvedValue("fake-google-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows a message after requesting a password reset", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /forgot password/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it("shows a verification code step when the server requires two-factor authentication", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
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
            user: { id: "u1", email: "owner@example.com", totpEnabled: true },
            business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: "2026-01-01" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByText(/enter your code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });

  it("shows an error and stays on the code step when the two-factor code is wrong", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(JSON.stringify({ twoFactorRequired: true, challengeId: "chal-1" }), { status: 200 });
      }
      if (url.endsWith("/auth/2fa/challenge")) {
        return new Response(JSON.stringify({ error: "invalid_code" }), { status: 401 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    await user.type(await screen.findByLabelText(/verification code/i), "000000");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't work/i);
  });
});
