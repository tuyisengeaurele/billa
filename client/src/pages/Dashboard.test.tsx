import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a welcome message with the business name", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });
});
