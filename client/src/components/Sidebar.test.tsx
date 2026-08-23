import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { Sidebar } from "./Sidebar";

function mockFetch() {
  vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
}

function renderSidebar(onNavigate?: () => void) {
  mockFetch();
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar billingBanner={null} onNavigate={onNavigate} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows every nav link", async () => {
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^invoices$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /proforma invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /delivery notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^quotes$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /receipts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Items" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("calls onNavigate when a link is clicked", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderSidebar(onNavigate);

    await user.click(await screen.findByRole("link", { name: "Customers" }));

    expect(onNavigate).toHaveBeenCalled();
  });

  it("shows the billing banner when provided", async () => {
    mockFetch();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Sidebar billingBanner="Your trial ends in 2 days." />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Your trial ends in 2 days.")).toBeInTheDocument();
  });

  it("opens a confirmation modal and calls the logout endpoint once confirmed", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByRole("link", { name: "Dashboard" });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

    const dialog = await screen.findByRole("dialog", { name: /log out/i });
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /log out/i }));

    expect(fetchSpy).toHaveBeenCalled();
  });

  it("does not log out when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByRole("link", { name: "Dashboard" });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

    const dialog = await screen.findByRole("dialog", { name: /log out/i });
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
