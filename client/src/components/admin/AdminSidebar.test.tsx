import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { AdminSidebar } from "./AdminSidebar";

function renderAdminSidebar(initialPath = "/admin/users") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AdminSidebar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every nav link and no back-to-app link", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderAdminSidebar();

    expect(await screen.findByRole("link", { name: /metrics/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /businesses/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /messages/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /audit log/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /system health/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /announcements/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to app/i })).not.toBeInTheDocument();
  });

  it("calls the logout endpoint once the confirmation modal is confirmed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAdminSidebar();
    await screen.findByRole("link", { name: /metrics/i });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

    const dialog = await screen.findByRole("dialog", { name: /log out/i });
    await user.click(within(dialog).getByRole("button", { name: /log out/i }));

    expect(fetchSpy).toHaveBeenCalled();
  });
});
