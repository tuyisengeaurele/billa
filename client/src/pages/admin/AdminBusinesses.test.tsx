import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminBusinesses from "./AdminBusinesses";

describe("AdminBusinesses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the business list and links to a business's detail page", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "biz1",
              name: "Kigali Traders",
              ownerEmail: "owner@example.com",
              memberCount: 2,
              documentCount: 5,
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
        <AdminBusinesses />
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: "Kigali Traders" });
    expect(link).toHaveAttribute("href", "/admin/businesses/biz1");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });
});
