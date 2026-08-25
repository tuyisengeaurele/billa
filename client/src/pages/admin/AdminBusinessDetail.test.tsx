import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import AdminBusinessDetail from "./AdminBusinessDetail";

function renderPage(businessId = "biz1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/businesses/${businessId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/businesses/:id" element={<AdminBusinessDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AdminBusinessDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the owner and member list, linking each to their user detail page", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          business: {
            id: "biz1",
            name: "Kigali Traders",
            createdAt: "2026-08-01T00:00:00.000Z",
            owner: { id: "u1", email: "owner@example.com" },
            members: [{ id: "u2", email: "member@example.com", joinedAt: "2026-08-05T00:00:00.000Z" }],
            documentCount: 3,
            customerCount: 2,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage();

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "owner@example.com" })).toHaveAttribute("href", "/admin/users/u1");
    expect(screen.getByRole("link", { name: "member@example.com" })).toHaveAttribute("href", "/admin/users/u2");
  });

  it("shows a not-found message for an unknown business", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 404 }));

    renderPage("nonexistent");

    expect(await screen.findByText(/no business found/i)).toBeInTheDocument();
  });
});
