import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import Developers from "./Developers";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={["/developers"]}>
        <AuthProvider>
          <Developers />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

function mockSignedIn(userOverrides: Record<string, unknown> = {}) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com", isAdmin: false, ...userOverrides },
          business: { id: "b1", name: "Kigali Traders", onboardingCompletedAt: "2026-09-01T00:00:00.000Z" },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/api-keys") || url.endsWith("/webhooks")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Developers", () => {
  it("documents authentication, the endpoints and webhooks for anyone", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    renderPage();

    expect(await screen.findByRole("heading", { name: /build on billa/i })).toBeInTheDocument();
    for (const name of ["Authentication", "Errors", "Customers", "Items", "Documents", "Webhooks", "Your keys"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("/api/v1/documents/:id/finalize")).toBeInTheDocument();
    expect(screen.getByText(/document\.finalized/)).toBeInTheDocument();
  });

  it("links back to the home page", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    renderPage();

    expect(await screen.findByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");
  });

  it("asks a visitor who is not signed in to log in, without showing any key tools", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    renderPage();

    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /start free trial/i })).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("heading", { name: /api access/i })).not.toBeInTheDocument();
  });

  it("gives a signed-in business owner the key and webhook tools", async () => {
    mockSignedIn();

    renderPage();

    expect(await screen.findByRole("heading", { name: /api access/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add webhook" })).toBeInTheDocument();
    expect(screen.getByText(/signed in as owner@example\.com/i)).toBeInTheDocument();
  });

  it("does not offer key tools to an admin account, which has no business of its own", async () => {
    mockSignedIn({ isAdmin: true });

    renderPage();

    expect(await screen.findByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /api access/i })).not.toBeInTheDocument();
  });
});
