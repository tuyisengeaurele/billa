import { render, screen, within } from "@testing-library/react";
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
  });

  it("calls the logout endpoint once the confirmation modal is confirmed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByRole("link", { name: /customers/i });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

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
});
