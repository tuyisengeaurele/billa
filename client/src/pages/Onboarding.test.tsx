import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Onboarding from "./Onboarding";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <AuthProvider>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Onboarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a spinner instead of a blank screen while loading", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));

    renderOnboarding();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("starts on the business details step, prefilled with the current business name", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "My Business" } }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderOnboarding();

    expect(await screen.findByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/tell us about your business/i)).toBeInTheDocument();
    expect(await screen.findByDisplayValue("My Business")).toBeInTheDocument();
  });

  it("moves to the logo step after the details step completes", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "My Business" } }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderOnboarding();
    await screen.findByText("Step 1 of 2");

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByText(/add your logo/i)).toBeInTheDocument();
  });

  it("navigates to the dashboard once the logo step completes, marking onboarding complete", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "My Business" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/onboarding/complete") && init?.method === "POST") {
        calls.push(url);
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderOnboarding();
    await screen.findByText("Step 1 of 2");

    await user.click(screen.getByRole("button", { name: /skip this step/i }));
    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
    expect(calls).toHaveLength(1);
  });

  it("navigates straight to the dashboard when 'skip onboarding' is clicked, marking onboarding complete", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "My Business" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/onboarding/complete") && init?.method === "POST") {
        calls.push(url);
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderOnboarding();
    await screen.findByText("Step 1 of 2");

    await user.click(screen.getByRole("button", { name: /skip onboarding/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
    expect(calls).toHaveLength(1);
  });
});
