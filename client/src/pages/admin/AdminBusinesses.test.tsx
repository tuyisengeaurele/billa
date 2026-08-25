import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import AdminBusinesses from "./AdminBusinesses";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

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
        <AuthProvider>
          <AdminBusinesses />
        </AuthProvider>
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: "Kigali Traders" });
    expect(link).toHaveAttribute("href", "/admin/businesses/biz1");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("exports businesses to CSV when the export button is clicked", async () => {
    if (!URL.createObjectURL) URL.createObjectURL = () => "";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    let exportRequested = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/admin/businesses/export.csv")) {
        exportRequested = true;
        return new Response(new Blob(["Name\nKigali Traders"], { type: "text/csv" }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminBusinesses />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /export csv/i }));

    await vi.waitFor(() => expect(exportRequested).toBe(true));
  });
});
