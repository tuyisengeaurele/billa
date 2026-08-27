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

  it("links the avatar and name straight to the profile page", async () => {
    renderUserMenu();

    const profileLink = await screen.findByRole("link", { name: /ange aurele/i });
    expect(profileLink).toHaveAttribute("href", "/profile");
  });

  it("puts a standalone log out button to the left of the profile link, with a confirmation", async () => {
    const user = userEvent.setup();
    renderUserMenu();

    await screen.findByRole("link", { name: /ange aurele/i });
    await user.click(screen.getByRole("button", { name: /^log out$/i }));

    const dialog = await screen.findByRole("dialog", { name: /^log out$/i });
    expect(within(dialog).getByText("Log out of Billa?")).toBeInTheDocument();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(within(dialog).getByRole("button", { name: /^log out$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it("does not log out when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    renderUserMenu();

    await screen.findByRole("link", { name: /ange aurele/i });
    await user.click(screen.getByRole("button", { name: /^log out$/i }));

    const dialog = await screen.findByRole("dialog", { name: /^log out$/i });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
