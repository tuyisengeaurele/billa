import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastTestWrapper } from "../../test/ToastTestWrapper";
import * as clipboardModule from "../../lib/clipboard";
import { WebhooksSection } from "./WebhooksSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

const ENDPOINT = {
  id: "w1",
  url: "https://hooks.example.com/billa",
  events: ["payment.received"],
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function renderSection() {
  return render(
    <ToastTestWrapper>
      <WebhooksSection />
    </ToastTestWrapper>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WebhooksSection", () => {
  it("lists endpoints with the events they listen for", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [ENDPOINT] }), { status: 200 }));

    renderSection();

    expect(await screen.findByText("https://hooks.example.com/billa")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem")).getByText("A payment is recorded")).toBeInTheDocument();
  });

  it("says when there are none", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    renderSection();

    expect(await screen.findByText(/no webhooks yet/i)).toBeInTheDocument();
  });

  it("adds a webhook and shows its secret once, with a copy button", async () => {
    const copy = vi.spyOn(clipboardModule, "copyToClipboard").mockResolvedValue(true);
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) =>
      init?.method === "POST" && urlOf(input).endsWith("/webhooks")
        ? new Response(JSON.stringify({ endpoint: ENDPOINT, secret: "whsec_topsecret" }), { status: 201 })
        : new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.type(await screen.findByLabelText("URL to send events to"), "https://hooks.example.com/billa");
    await user.click(screen.getByLabelText("A document is finalized"));
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    expect(await screen.findByText("whsec_topsecret")).toBeInTheDocument();
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      url: "https://hooks.example.com/billa",
      events: ["payment.received"],
    });
    await user.click(screen.getByRole("button", { name: "Copy secret" }));
    expect(copy).toHaveBeenCalledWith("whsec_topsecret");
    await user.click(screen.getByRole("button", { name: /i've saved it/i }));
    expect(screen.queryByText("whsec_topsecret")).not.toBeInTheDocument();
  });

  it("keeps Add webhook off until there is a URL and at least one event", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const user = userEvent.setup();
    renderSection();

    const add = await screen.findByRole("button", { name: "Add webhook" });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText("URL to send events to"), "https://hooks.example.com");
    expect(add).toBeEnabled();
    await user.click(screen.getByLabelText("A document is finalized"));
    await user.click(screen.getByLabelText("A payment is recorded"));
    expect(add).toBeDisabled();
  });

  it("shows the server's reason when the address is refused", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: "invalid_url", message: "That address is not reachable from the internet" }), { status: 400 })
        : new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.type(await screen.findByLabelText("URL to send events to"), "https://10.0.0.1/hook");
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    expect(await screen.findByText("That address is not reachable from the internet")).toBeInTheDocument();
  });

  it("sends a test event", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ deliveryId: "d1" }), { status: 202 })
        : new Response(JSON.stringify({ results: [ENDPOINT] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Send test" }));

    expect(await screen.findByText("Test event sent")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([input]) => urlOf(input).endsWith("/webhooks/w1/test"))).toBe(true);
  });

  it("switches an endpoint off", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "PATCH"
        ? new Response(JSON.stringify({ endpoint: { ...ENDPOINT, active: false } }), { status: 200 })
        : new Response(JSON.stringify({ results: [ENDPOINT] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Switch off" }));

    expect(await screen.findByRole("button", { name: "Switch on" })).toBeInTheDocument();
    expect(screen.getByText(/switched off/i)).toBeInTheDocument();
  });

  it("shows recent deliveries with their outcome", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) =>
      urlOf(input).endsWith("/deliveries")
        ? new Response(
            JSON.stringify({
              results: [
                { id: "d1", event: "payment.received", status: "FAILED", attempts: 5, lastStatusCode: 500, lastError: "The receiver answered 500", createdAt: new Date().toISOString() },
                { id: "d2", event: "document.finalized", status: "SUCCEEDED", attempts: 1, lastStatusCode: 200, lastError: null, createdAt: new Date().toISOString() },
              ],
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ results: [ENDPOINT] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Recent deliveries" }));

    expect(await screen.findByText(/failed \(500\): the receiver answered 500/i)).toBeInTheDocument();
    expect(screen.getByText(/delivered \(200\)/i)).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ deleted: true }), { status: 200 })
        : new Response(JSON.stringify({ results: [ENDPOINT] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete webhook" }));

    expect(await screen.findByText(/no webhooks yet/i)).toBeInTheDocument();
  });

  it("offers a retry when the list cannot load", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    renderSection();

    expect(await screen.findByText(/couldn't load webhooks/i)).toBeInTheDocument();
  });
});
