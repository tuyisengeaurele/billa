import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Register from "./Register";

vi.mock("../lib/firebaseAuth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFirebase: vi.fn(),
  resetPassword: vi.fn(),
  firebaseErrorCode: (err: unknown) =>
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : null,
}));

import { signInWithGoogle, signUpWithEmail } from "../lib/firebaseAuth";

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("Register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no business name field", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderRegister();

    await screen.findByRole("button", { name: /create account/i });
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });

  it("puts Continue with Google below the Create account button", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderRegister();

    const buttons = await screen.findAllByRole("button");
    const createIndex = buttons.findIndex((b) => /create account/i.test(b.textContent ?? ""));
    const googleIndex = buttons.findIndex((b) => /continue with google/i.test(b.textContent ?? ""));
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(googleIndex).toBeGreaterThan(createIndex);
  });

  it("marks the email field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true"));
  });

  it("navigates to /onboarding after a successful registration with a default business name", async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        const body = JSON.parse(init?.body as string);
        expect(body.businessName).toBe("My Business");
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "My Business" },
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^password/i), "Supersecret1!");
    await user.type(screen.getByLabelText(/confirm password/i), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner when the email is already taken", async () => {
    vi.mocked(signUpWithEmail).mockRejectedValue({ code: "auth/email-already-in-use" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^password/i), "Supersecret1!");
    await user.type(screen.getByLabelText(/confirm password/i), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
  });

  it("shows an error when the confirm password field doesn't match", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(await screen.findByLabelText(/^password/i), "Supersecret1!");
    await user.type(screen.getByLabelText(/confirm password/i), "Different1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/passwords don.t match/i)).toBeInTheDocument();
  });

  it("shows password requirements as unmet before typing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderRegister();

    const items = await screen.findAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveClass("text-neutral-400");
    }
  });

  it("shows password requirements as met once a strong password is typed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/^password/i), "Supersecret1!");

    const items = screen.getAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveClass("text-success");
    }
  });

  it("signs up with Google using a default business name", async () => {
    vi.mocked(signInWithGoogle).mockResolvedValue("fake-google-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        const body = JSON.parse(init?.body as string);
        expect(body.businessName).toBe("My Business");
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "My Business" },
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });
});
