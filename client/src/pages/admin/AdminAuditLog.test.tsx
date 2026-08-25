import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import AdminAuditLog from "./AdminAuditLog";

describe("AdminAuditLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows logged admin actions", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "log1",
              action: "ADMIN_GRANTED",
              targetType: "User",
              targetId: "u2",
              createdAt: "2026-08-25T10:00:00.000Z",
              admin: { id: "u1", email: "admin@example.com" },
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
          <AdminAuditLog />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("ADMIN_GRANTED")).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminAuditLog />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/no admin actions logged yet/i)).toBeInTheDocument();
  });
});
