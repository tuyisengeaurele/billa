import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { RootRoute } from "./RootRoute";

function mockFetch(loggedIn: boolean) {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    loggedIn
      ? new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        )
      : new Response("{}", { status: 401 }),
  );
}

function renderRootRoute() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RootRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a spinner instead of a blank screen while the auth check is in flight", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));

    renderRootRoute();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to the dashboard when logged in", async () => {
    mockFetch(true);

    renderRootRoute();

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it("shows the landing page when logged out", async () => {
    mockFetch(false);

    renderRootRoute();

    expect((await screen.findAllByRole("link", { name: /start free trial/i }))[0]).toBeInTheDocument();
  });
});
