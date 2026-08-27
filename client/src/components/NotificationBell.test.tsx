import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { NotificationBell } from "./NotificationBell";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function authResponse() {
  return new Response(
    JSON.stringify({
      user: {
        id: "u1",
        email: "owner@example.com",
        name: "Ange Aurele",
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

function renderBell(mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.spyOn(global, "fetch").mockImplementation(mock);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationBell allHref="/notifications" />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("NotificationBell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an unread indicator and lists notifications when opened", async () => {
    const user = userEvent.setup();
    renderBell(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return authResponse();
      if (url.endsWith("/notifications")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "n1",
                type: "PAYMENT_RECEIVED",
                title: "Payment received for INV-0001",
                body: null,
                link: "/documents/doc1",
                readAt: null,
                createdAt: "2026-08-27T00:00:00.000Z",
              },
            ],
            unreadCount: 1,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    await waitFor(() => expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument());
    await user.click(screen.getByLabelText(/notifications/i));

    expect(await screen.findByText("Payment received for INV-0001")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /view all/i })).toHaveAttribute("href", "/notifications");
  });

  it("marks a notification as read when clicked", async () => {
    let markedRead = false;
    const user = userEvent.setup();
    renderBell(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return authResponse();
      if (url.endsWith("/notifications/n1/read") && init?.method === "POST") {
        markedRead = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/notifications")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "n1",
                type: "MEMBER_JOINED",
                title: "Friend joined your team",
                body: null,
                link: "/settings",
                readAt: null,
                createdAt: "2026-08-27T00:00:00.000Z",
              },
            ],
            unreadCount: 1,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    await user.click(await screen.findByLabelText(/notifications/i));
    await user.click(await screen.findByText("Friend joined your team"));

    await waitFor(() => expect(markedRead).toBe(true));
  });

  it("marks all notifications as read", async () => {
    let markedAll = false;
    const user = userEvent.setup();
    renderBell(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return authResponse();
      if (url.endsWith("/notifications/mark-all-read") && init?.method === "POST") {
        markedAll = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/notifications")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "n1",
                type: "MEMBER_JOINED",
                title: "Friend joined your team",
                body: null,
                link: null,
                readAt: null,
                createdAt: "2026-08-27T00:00:00.000Z",
              },
            ],
            unreadCount: 1,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    await user.click(await screen.findByLabelText(/notifications/i));
    await user.click(await screen.findByRole("button", { name: /mark all as read/i }));

    await waitFor(() => expect(markedAll).toBe(true));
  });

  it("shows an empty state when there is nothing yet", async () => {
    const user = userEvent.setup();
    renderBell(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return authResponse();
      if (url.endsWith("/notifications")) {
        return new Response(JSON.stringify({ results: [], unreadCount: 0 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    await user.click(await screen.findByLabelText(/notifications/i));

    expect(await screen.findByText(/nothing yet/i)).toBeInTheDocument();
  });
});
