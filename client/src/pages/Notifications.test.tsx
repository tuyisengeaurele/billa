import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Notifications from "./Notifications";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <Routes>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/documents/:id" element={<p>document page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists notifications and shows an unread marker", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
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
              {
                id: "n2",
                type: "MEMBER_JOINED",
                title: "Friend joined your team",
                body: null,
                link: null,
                readAt: "2026-08-26T00:00:00.000Z",
                createdAt: "2026-08-26T00:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText("Payment received for INV-0001")).toBeInTheDocument();
    expect(screen.getByText("Friend joined your team")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark all as read/i })).toBeInTheDocument();
  });

  it("shows an empty state when there are none", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    renderPage();

    expect(await screen.findByText(/nothing yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark all as read/i })).not.toBeInTheDocument();
  });

  it("navigates to the linked page and marks the notification read when clicked", async () => {
    let markedRead = false;
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
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
                type: "PAYMENT_RECEIVED",
                title: "Payment received for INV-0001",
                body: null,
                link: "/documents/doc1",
                readAt: null,
                createdAt: "2026-08-27T00:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();
    await user.click(await screen.findByText("Payment received for INV-0001"));

    expect(await screen.findByText("document page")).toBeInTheDocument();
    await waitFor(() => expect(markedRead).toBe(true));
  });

  it("marks everything as read", async () => {
    let markedAll = false;
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
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
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();
    await user.click(await screen.findByRole("button", { name: /mark all as read/i }));

    await waitFor(() => expect(markedAll).toBe(true));
  });
});
