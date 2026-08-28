import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { AdminLayoutRoute } from "../../components/admin/AdminLayoutRoute";
import AdminBusinessDetail from "./AdminBusinessDetail";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage(businessId = "biz1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/businesses/${businessId}`]}>
      <AuthProvider>
        <Routes>
          <Route element={<AdminLayoutRoute />}>
            <Route path="/admin/businesses/:id" element={<AdminBusinessDetail />} />
          </Route>
          <Route path="/admin/businesses" element={<div>businesses list page</div>} />
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

    expect(await screen.findByRole("link", { name: "owner@example.com" })).toHaveAttribute("href", "/admin/users/u1");
    expect(screen.getByRole("link", { name: "member@example.com" })).toHaveAttribute("href", "/admin/users/u2");
  });

  it("shows a Businesses / <name> breadcrumb in the top bar, with Businesses linking back to the list", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          business: {
            id: "biz1",
            name: "Kigali Traders",
            createdAt: "2026-08-01T00:00:00.000Z",
            owner: { id: "u1", email: "owner@example.com" },
            members: [],
            documentCount: 0,
            customerCount: 0,
          },
        }),
        { status: 200 },
      ),
    );

    renderPage();

    const heading = await screen.findByRole("heading", { name: /businesses.*kigali traders/i }, { timeout: 5000 });
    expect(within(heading).getByRole("link", { name: "Businesses" })).toHaveAttribute("href", "/admin/businesses");
    expect(within(heading).getByText("Kigali Traders")).toBeInTheDocument();
  });

  it("requires typing the business name before the delete button is enabled, then deletes and redirects", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/admin/businesses/biz1") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/businesses/biz1")) {
        return new Response(
          JSON.stringify({
            business: {
              id: "biz1",
              name: "Kigali Traders",
              createdAt: "2026-08-01T00:00:00.000Z",
              owner: { id: "u1", email: "owner@example.com" },
              members: [],
              documentCount: 3,
              customerCount: 2,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /delete business/i }));
    const dialog = await screen.findByRole("dialog", { name: /delete business/i });
    const confirmButton = within(dialog).getByRole("button", { name: /^delete business$/i });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/type/i), "Kigali Traders");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(await screen.findByText("businesses list page")).toBeInTheDocument();
  });

  it("requires typing the current name before rename is enabled, then renames and updates the page", async () => {
    let currentName = "Kigali Traders";
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/admin/businesses/biz1") && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        currentName = body.name;
        return new Response(JSON.stringify({ business: { id: "biz1", name: currentName } }), { status: 200 });
      }
      if (url.endsWith("/admin/businesses/biz1")) {
        return new Response(
          JSON.stringify({
            business: {
              id: "biz1",
              name: currentName,
              createdAt: "2026-08-01T00:00:00.000Z",
              owner: { id: "u1", email: "owner@example.com" },
              members: [],
              documentCount: 3,
              customerCount: 2,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /rename business/i }));
    const dialog = await screen.findByRole("dialog", { name: /rename business/i });
    const confirmButton = within(dialog).getByRole("button", { name: /^rename$/i });
    expect(confirmButton).toBeDisabled();

    await user.clear(within(dialog).getByLabelText(/new business name/i));
    await user.type(within(dialog).getByLabelText(/new business name/i), "Musanze Traders");
    await user.type(within(dialog).getByLabelText(/type/i), "Kigali Traders");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(await screen.findByText("Musanze Traders")).toBeInTheDocument();
  });

  it("shows a not-found message for an unknown business", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 404 }));

    renderPage("nonexistent");

    expect(await screen.findByText(/no business found/i)).toBeInTheDocument();
  });
});
