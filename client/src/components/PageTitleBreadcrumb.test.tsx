import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageTitleProvider, usePageTitle } from "../context/PageTitleContext";
import { PageTitleBreadcrumb } from "./PageTitleBreadcrumb";

function Setter({ title }: { title: Parameters<typeof usePageTitle>[0] }) {
  usePageTitle(title);
  return null;
}

function renderBreadcrumb(title: Parameters<typeof usePageTitle>[0]) {
  return render(
    <MemoryRouter>
      <PageTitleProvider>
        <Setter title={title} />
        <PageTitleBreadcrumb />
      </PageTitleProvider>
    </MemoryRouter>,
  );
}

describe("PageTitleBreadcrumb", () => {
  it("renders a plain string title with no link", () => {
    renderBreadcrumb("Businesses");

    expect(screen.getByRole("heading", { name: "Businesses" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a parent segment as a link back to its list, and the current page as plain text", () => {
    renderBreadcrumb([
      { label: "Users", href: "/admin/users" },
      { label: "owner@example.com" },
    ]);

    const link = screen.getByRole("link", { name: "Users" });
    expect(link).toHaveAttribute("href", "/admin/users");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "owner@example.com" })).not.toBeInTheDocument();
  });
});
