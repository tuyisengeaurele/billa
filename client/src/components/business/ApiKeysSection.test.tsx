import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastTestWrapper } from "../../test/ToastTestWrapper";
import * as clipboardModule from "../../lib/clipboard";
import { ApiKeysSection } from "./ApiKeysSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

const ACTIVE = {
  id: "k1",
  name: "Accounting sync",
  keyPrefix: "bla_live_ab12",
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};
const REVOKED = { ...ACTIVE, id: "k2", name: "Old key", revokedAt: "2026-09-02T00:00:00.000Z" };

function renderSection() {
  return render(
    <ToastTestWrapper>
      <ApiKeysSection />
    </ToastTestWrapper>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiKeysSection", () => {
  it("lists keys by prefix, marking unused and revoked ones", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [ACTIVE, REVOKED] }), { status: 200 }));

    renderSection();

    expect(await screen.findByText("Accounting sync")).toBeInTheDocument();
    expect(screen.getByText(/never used/i)).toBeInTheDocument();
    expect(screen.getByText("Old key")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });

  it("says when there are no keys", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    renderSection();

    expect(await screen.findByText(/no keys yet/i)).toBeInTheDocument();
  });

  it("creates a key and shows it once, with a copy button", async () => {
    const copy = vi.spyOn(clipboardModule, "copyToClipboard").mockResolvedValue(true);
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "POST" && urlOf(input).endsWith("/api-keys")) {
        return new Response(JSON.stringify({ apiKey: ACTIVE, key: "bla_live_secretsecretsecret" }), { status: 201 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const user = userEvent.setup();
    renderSection();

    await user.type(await screen.findByLabelText("Key name"), "Accounting sync");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText("bla_live_secretsecretsecret")).toBeInTheDocument();
    expect(screen.getByText(/it won't be shown again/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy key" }));
    expect(copy).toHaveBeenCalledWith("bla_live_secretsecretsecret");

    await user.click(screen.getByRole("button", { name: /i've saved it/i }));
    expect(screen.queryByText("bla_live_secretsecretsecret")).not.toBeInTheDocument();
    expect(screen.getByText("Accounting sync")).toBeInTheDocument();
  });

  it("keeps Create key off until a name is typed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    renderSection();

    expect(await screen.findByRole("button", { name: "Create key" })).toBeDisabled();
  });

  it("explains the ten key limit", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: "too_many_api_keys" }), { status: 409 })
        : new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.type(await screen.findByLabelText("Key name"), "Another");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText(/you have 10 active keys/i)).toBeInTheDocument();
  });

  it("asks before revoking, then marks the key revoked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ revoked: true }), { status: 200 })
        : new Response(JSON.stringify({ results: [ACTIVE] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/stops working straight away/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }));

    expect(await screen.findByText("Revoked")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([input, init]) => urlOf(input).endsWith("/api-keys/k1") && init?.method === "DELETE")).toBe(true);
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("offers a retry when the list cannot load", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    renderSection();

    expect(await screen.findByText(/couldn't load api keys/i)).toBeInTheDocument();
  });
});
