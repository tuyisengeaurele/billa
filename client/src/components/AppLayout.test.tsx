import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { AppLayout } from "./AppLayout";

function renderAppLayout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppLayout>
          <p>page content</p>
        </AppLayout>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the impersonation banner and returns to admin on click", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/impersonate/stop")) {
        return new Response(
          JSON.stringify({
            user: { id: "admin1", email: "admin@example.com", productTourSeenAt: "2026-01-01T00:00:00.000Z" },
            business: { id: "b2", name: "Admin Co" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com", productTourSeenAt: "2026-01-01T00:00:00.000Z" },
            business: { id: "b1", name: "Kigali Traders" },
            impersonating: true,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderAppLayout();

    expect(await screen.findByText(/viewing as owner@example.com/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /return to admin/i }));

    await waitFor(() => expect(screen.queryByText(/viewing as/i)).not.toBeInTheDocument());
  });

  it("doesn't show the impersonation banner for a normal session", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderAppLayout();

    await screen.findByText("page content");
    expect(screen.queryByText(/viewing as/i)).not.toBeInTheDocument();
  });

  it("renders nav links and children", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderAppLayout();

    expect(await screen.findByRole("link", { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /items/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^invoices$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /proforma invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /delivery notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^quotes$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /receipts/i })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toBeInTheDocument();
  });

  it("calls the logout endpoint once the confirmation modal is confirmed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u1",
              email: "owner@example.com",
              name: "Owner Person",
              avatarUrl: null,
              totpEnabled: false,
              isAdmin: false,
              productTourSeenAt: "2026-01-01T00:00:00.000Z",
            },
            business: { id: "b1", name: "Kigali Traders" },
            impersonating: false,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByRole("link", { name: /customers/i });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));

    const dialog = await screen.findByRole("dialog", { name: /log out/i });
    await user.click(within(dialog).getByRole("button", { name: /log out/i }));

    expect(fetchSpy).toHaveBeenCalled();
  });

  it("opens and closes the mobile navigation drawer", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByRole("link", { name: /customers/i });

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    const customersLinks = screen.getAllByRole("link", { name: /customers/i });
    expect(customersLinks.length).toBeGreaterThan(1);

    await user.click(customersLinks[customersLinks.length - 1]);
    expect(screen.getAllByRole("link", { name: /customers/i })).toHaveLength(1);
  });

  it("opens the search palette on Cmd/Ctrl+K", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByText("page content");

    await user.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByRole("dialog", { name: /search/i })).toBeInTheDocument();
  });
});
