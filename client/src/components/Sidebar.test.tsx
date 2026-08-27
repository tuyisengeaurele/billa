import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveDocumentTypeProvider, useSetActiveDocumentType } from "../context/ActiveDocumentTypeContext";
import { AuthProvider } from "../context/AuthContext";
import { Sidebar } from "./Sidebar";

function mockFetch() {
  vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
}

function renderSidebar(onNavigate?: () => void, initialEntries = ["/"]) {
  mockFetch();
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Sidebar billingBanner={null} onNavigate={onNavigate} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function ReportsDocumentType({ type }: { type: "INVOICE" }) {
  useSetActiveDocumentType(type);
  return null;
}

function renderSidebarViewingDocumentType(type: "INVOICE") {
  mockFetch();
  return render(
    <MemoryRouter initialEntries={["/documents/doc1/edit"]}>
      <AuthProvider>
        <ActiveDocumentTypeProvider>
          <ReportsDocumentType type={type} />
          <Sidebar billingBanner={null} />
        </ActiveDocumentTypeProvider>
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
    expect(screen.getByRole("link", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Receivables" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^invoices$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /proforma invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /delivery notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^quotes$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /receipts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /credit notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Items" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
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

  it("highlights Customers while viewing a customer's statement page", async () => {
    renderSidebar(undefined, ["/customers/c1/statement"]);

    const link = await screen.findByRole("link", { name: "Customers" });
    expect(link.querySelector("span.z-10")).toHaveClass("text-primary-700");
  });

  it("does not highlight Customers on an unrelated page", async () => {
    renderSidebar(undefined, ["/dashboard"]);

    const link = await screen.findByRole("link", { name: "Customers" });
    expect(link.querySelector("span.z-10")).not.toHaveClass("text-primary-700");
  });

  it("highlights a document type link while editing a document of that type", async () => {
    renderSidebarViewingDocumentType("INVOICE");

    const link = await screen.findByRole("link", { name: /^invoices$/i });
    expect(link.querySelector("span.z-10")).toHaveClass("text-primary-700");
  });
});
