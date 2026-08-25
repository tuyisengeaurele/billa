import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminLayout } from "./AdminLayout";

describe("AdminLayout", () => {
  it("renders the nav links, back-to-app link, and children", () => {
    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AdminLayout>
          <p>page content</p>
        </AdminLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "System health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Businesses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit log" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to app" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
