import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import AdminUsers from "./AdminUsers";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("AdminUsers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the user list and links to a user's detail page", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "u1",
              email: "owner@example.com",
              isAdmin: false,
              trialEndsAt: "2026-09-01T00:00:00.000Z",
              currentPeriodEnd: null,
              plan: null,
              createdAt: "2026-08-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminUsers />
        </AuthProvider>
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: "owner@example.com" });
    expect(link).toHaveAttribute("href", "/admin/users/u1");
  });

  it("searches by email, re-fetching with the search param", async () => {
    let lastUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      lastUrl = urlOf(input);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminUsers />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText(/no users found/i);

    await user.type(screen.getByLabelText(/search users/i), "acme");

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(lastUrl).toContain("search=acme");
  });
});
