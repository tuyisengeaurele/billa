import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { AdminLayout } from "./AdminLayout";

describe("AdminLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the nav links, no back-to-app link, and children", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

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
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
