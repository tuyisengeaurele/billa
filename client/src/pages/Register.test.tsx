import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Register from "./Register";

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

  it("marks the business name field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/business name/i)).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("navigates to /onboarding after a successful registration", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/register")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner when the email is already taken", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/register")) {
        return new Response(JSON.stringify({ error: "email_taken" }), { status: 409 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
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

    await user.type(await screen.findByLabelText(/password/i), "Supersecret1!");

    const items = screen.getAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveClass("text-success");
    }
  });
});
