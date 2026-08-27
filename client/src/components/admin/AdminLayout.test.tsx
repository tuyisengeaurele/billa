import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { AdminLayout } from "./AdminLayout";

describe("AdminLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the nav links, no back-to-app link, and children", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "a1",
              email: "admin@example.com",
              name: "Admin Person",
              avatarUrl: null,
              totpEnabled: false,
              isAdmin: true,
              productTourSeenAt: "2026-01-01T00:00:00.000Z",
            },
            business: { id: "b1", name: "Admin Co" },
            impersonating: false,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AuthProvider>
          <AdminLayout>
            <p>page content</p>
          </AdminLayout>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "System health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Businesses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit log" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to app/i })).not.toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /admin person/i }));
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /view profile/i })).toHaveAttribute("href", "/admin/profile");
  });
});
