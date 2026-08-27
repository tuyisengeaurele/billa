import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { AppLayoutRoute } from "./AppLayoutRoute";

function renderApp() {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayoutRoute />}>
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/customers" element={<p>Customers page</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppLayoutRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the sidebar mounted across page navigation instead of remounting it", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Dashboard page");
    const sidebarBeforeNavigation = screen.getByRole("navigation");

    await user.click(screen.getByRole("link", { name: "Customers" }));

    await screen.findByText("Customers page");
    const sidebarAfterNavigation = screen.getByRole("navigation");

    expect(sidebarAfterNavigation).toBe(sidebarBeforeNavigation);
  });
});
