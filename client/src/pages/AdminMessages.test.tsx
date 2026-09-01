import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import AdminMessages from "./AdminMessages";

function renderAdminMessages() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={["/admin/messages"]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/messages" element={<AdminMessages />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("AdminMessages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists contact messages", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/contact")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "m1", name: "Aline", email: "aline@example.com", message: "Need help", createdAt: "2026-08-23T00:00:00.000Z" },
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

    renderAdminMessages();

    expect(await screen.findByText("Aline")).toBeInTheDocument();
    expect(screen.getByText("Need help")).toBeInTheDocument();
  });

  it("shows a forbidden message for a non-admin user", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/contact")) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      return new Response("{}", { status: 401 });
    });

    renderAdminMessages();

    expect(await screen.findByRole("alert")).toHaveTextContent(/don't have access/i);
  });

  it("shows an empty state when there are no messages", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/contact")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderAdminMessages();

    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("deletes a message after confirming", async () => {
    let deleteRequested = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/contact/m1") && init?.method === "DELETE") {
        deleteRequested = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/contact")) {
        return new Response(
          JSON.stringify({
            results: deleteRequested
              ? []
              : [
                  {
                    id: "m1",
                    name: "Aline",
                    email: "aline@example.com",
                    message: "Need help",
                    createdAt: "2026-08-23T00:00:00.000Z",
                  },
                ],
            total: deleteRequested ? 0 : 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderAdminMessages();

    await user.click(await screen.findByRole("button", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByText("Message deleted")).toBeInTheDocument();
    expect(deleteRequested).toBe(true);
  });

  it("shows an error toast when deleting fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/contact/m1") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }
      if (url.includes("/contact")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "m1", name: "Aline", email: "aline@example.com", message: "Need help", createdAt: "2026-08-23T00:00:00.000Z" },
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

    const user = userEvent.setup();
    renderAdminMessages();

    await user.click(await screen.findByRole("button", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByText("Couldn't delete this message. Try again.")).toBeInTheDocument();
  });
});
