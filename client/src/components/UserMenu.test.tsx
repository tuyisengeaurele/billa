import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { UserMenu } from "./UserMenu";

function renderUserMenu() {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: {
            id: "u1",
            email: "owner@example.com",
            name: "Ange Aurele",
            avatarUrl: null,
            totpEnabled: false,
            isAdmin: false,
            productTourSeenAt: "2026-01-01T00:00:00.000Z",
          },
          business: { id: "b1", name: "Kigali Traders" },
          impersonating: false,
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <UserMenu profileHref="/profile" logoutConfirmMessage="Log out of Billa?" />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("UserMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the user's name and opens a menu with a profile link", async () => {
    const user = userEvent.setup();
    renderUserMenu();

    const trigger = await screen.findByRole("button", { name: /ange aurele/i });
    await user.click(trigger);

    const profileLink = screen.getByRole("menuitem", { name: /view profile/i });
    expect(profileLink).toHaveAttribute("href", "/profile");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("closes the menu when clicking outside", async () => {
    const user = userEvent.setup();
    renderUserMenu();

    await user.click(await screen.findByRole("button", { name: /ange aurele/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("confirms before logging out", async () => {
    const user = userEvent.setup();
    renderUserMenu();

    await user.click(await screen.findByRole("button", { name: /ange aurele/i }));
    await user.click(screen.getByRole("menuitem", { name: /log out/i }));

    const dialog = await screen.findByRole("dialog", { name: /^log out$/i });
    expect(within(dialog).getByText("Log out of Billa?")).toBeInTheDocument();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(within(dialog).getByRole("button", { name: /^log out$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });
});
