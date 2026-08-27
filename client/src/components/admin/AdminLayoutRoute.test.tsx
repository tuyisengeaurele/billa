import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { usePageTitle } from "../../context/PageTitleContext";
import { AdminLayoutRoute } from "./AdminLayoutRoute";

function MetricsStub() {
  usePageTitle("Metrics");
  return <p>Metrics page</p>;
}

function UsersStub() {
  usePageTitle("Users");
  return <p>Users page</p>;
}

function renderApp() {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
  return render(
    <MemoryRouter initialEntries={["/admin/metrics"]}>
      <AuthProvider>
        <Routes>
          <Route element={<AdminLayoutRoute />}>
            <Route path="/admin/metrics" element={<MetricsStub />} />
            <Route path="/admin/users" element={<UsersStub />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AdminLayoutRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the sidebar mounted across page navigation instead of remounting it", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Metrics page");
    const sidebarBeforeNavigation = screen.getByRole("navigation");

    await user.click(screen.getByRole("link", { name: "Users" }));

    await screen.findByText("Users page");
    const sidebarAfterNavigation = screen.getByRole("navigation");

    expect(sidebarAfterNavigation).toBe(sidebarBeforeNavigation);
  });

  it("shows the current page's title in the header, driven by usePageTitle", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByRole("heading", { name: "Metrics" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Users" }));

    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
  });
});
