import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Activity from "./Activity";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Activity />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Activity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows team activity entries", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
          { status: 200 },
        );
      }
      if (url.includes("/business/activity")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "a1",
                action: "CUSTOMER_CREATED",
                entityType: "Customer",
                entityId: "c1",
                metadata: { name: "Acme Ltd" },
                createdAt: "2026-08-25T10:00:00.000Z",
                actor: { id: "u1", email: "owner@example.com" },
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/added customer Acme Ltd/i)).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.includes("/business/activity")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument();
  });

  it("switches to the my-activity filter and refetches with actorUserId", async () => {
    let lastUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      lastUrl = url;
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
          { status: 200 },
        );
      }
      if (url.includes("/business/activity")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no activity yet/i);

    await user.click(screen.getByRole("button", { name: /my activity/i }));

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(lastUrl).toContain("actorUserId=u1");
  });
});
