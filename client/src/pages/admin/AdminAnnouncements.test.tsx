import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { ToastTestWrapper } from "../../test/ToastTestWrapper";
import AdminAnnouncements from "./AdminAnnouncements";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter>
        <AuthProvider>
          <AdminAnnouncements />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("AdminAnnouncements", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists announcements and shows a deactivate button on the active one", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/admin/announcements")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "a2", message: "Second", active: true, createdAt: "2026-08-25T10:00:00.000Z" },
              { id: "a1", message: "First", active: false, createdAt: "2026-08-24T10:00:00.000Z" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
  });

  it("posts a new announcement and shows it in the list", async () => {
    let posted = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/admin/announcements") && init?.method === "POST") {
        posted = true;
        return new Response(
          JSON.stringify({
            announcement: { id: "a3", message: "New maintenance window", active: true, createdAt: "2026-08-25T11:00:00.000Z" },
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/admin/announcements")) {
        return new Response(
          JSON.stringify({
            results: posted
              ? [{ id: "a3", message: "New maintenance window", active: true, createdAt: "2026-08-25T11:00:00.000Z" }]
              : [],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/no announcements yet/i);
    await user.type(screen.getByLabelText(/message/i), "New maintenance window");
    await user.click(screen.getByRole("button", { name: /^post$/i }));

    expect(await screen.findByText("New maintenance window")).toBeInTheDocument();
    expect(await screen.findByText("Announcement posted")).toBeInTheDocument();
  });

  it("shows a live character count while composing", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/admin/announcements")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/no announcements yet/i);
    expect(screen.getByText("0/500")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/message/i), "Scheduled maintenance");

    expect(screen.getByText("21/500")).toBeInTheDocument();
  });

  it("deactivates the active announcement when confirmed", async () => {
    let active = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/deactivate") && init?.method === "POST") {
        active = false;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/admin/announcements")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "a1", message: "First", active, createdAt: "2026-08-24T10:00:00.000Z" }],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /deactivate/i }));

    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    expect(await screen.findByText("Announcement deactivated")).toBeInTheDocument();
  });
});
