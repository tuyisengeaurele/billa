import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { BusinessSwitcher } from "./BusinessSwitcher";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockFetch(businesses: { id: string; name: string; isOwner: boolean }[]) {
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    if (url.includes("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: businesses[0].id, name: businesses[0].name },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/businesses") && init?.method === "POST") {
      return new Response(JSON.stringify({ business: { id: "new-biz", name: "New Co" } }), { status: 201 });
    }
    if (url.includes("/businesses")) {
      return new Response(JSON.stringify({ businesses }), { status: 200 });
    }
    if (url.includes("/auth/switch-business")) {
      return new Response(JSON.stringify({ business: businesses[1] }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  });
}

function renderSwitcher() {
  return render(
    <AuthProvider>
      <BusinessSwitcher />
    </AuthProvider>,
  );
}

describe("BusinessSwitcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still offers a way to add a business when the account only has one", async () => {
    mockFetch([{ id: "b1", name: "Kigali Traders", isOwner: true }]);
    const user = userEvent.setup();

    renderSwitcher();

    const toggle = await screen.findByRole("button", { name: /Billa · Kigali Traders/i });
    await user.click(toggle);

    expect(screen.getByRole("button", { name: /add another business/i })).toBeInTheDocument();
    // Nothing to switch to yet, so no business rows besides the add action.
    expect(screen.queryByRole("button", { name: "Kigali Traders" })).not.toBeInTheDocument();
  });

  it("shows a dropdown listing every business when there is more than one", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.getByRole("button", { name: "Side Hustle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add another business/i })).toBeInTheDocument();
  });

  it("labels owned and shared businesses separately when the account has both", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Client Co", isOwner: false },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.getByText("Your businesses")).toBeInTheDocument();
    expect(screen.getByText("Shared with you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Client Co" })).toBeInTheDocument();
  });

  it("does not label the groups when every business is owned", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.queryByText("Your businesses")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared with you")).not.toBeInTheDocument();
  });

  it("hides the add-business action once the account owns 3 businesses", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
      { id: "b3", name: "Third Co", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.queryByRole("button", { name: /add another business/i })).not.toBeInTheDocument();
  });

  it("still allows adding a business when member-of businesses push the total to 3, since only owned ones count against the cap", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Client A", isOwner: false },
      { id: "b3", name: "Client B", isOwner: false },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.getByRole("button", { name: /add another business/i })).toBeInTheDocument();
  });

  it("closes when clicking outside the dropdown", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));
    expect(screen.getByRole("button", { name: "Side Hustle" })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("button", { name: "Side Hustle" })).not.toBeInTheDocument();
  });

  it("marks the toggle button's expanded state for screen readers", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    const toggle = await screen.findByRole("button", { name: /Billa · Kigali Traders/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("calls switch-business with the selected business id", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));
    await user.click(screen.getByRole("button", { name: "Side Hustle" }));

    const switchCall = vi
      .mocked(global.fetch)
      .mock.calls.find(([input]) => urlOf(input).includes("/auth/switch-business"));
    expect(switchCall).toBeDefined();
    expect(JSON.parse((switchCall![1] as RequestInit).body as string)).toEqual({ businessId: "b2" });
  });

  it("submits a new business name through the add-business form", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders", isOwner: true },
      { id: "b2", name: "Side Hustle", isOwner: true },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));
    await user.click(screen.getByRole("button", { name: /add another business/i }));
    await user.type(screen.getByLabelText("New business name"), "Third Co");
    await user.click(screen.getByRole("button", { name: /^add business$/i }));

    const createCall = vi
      .mocked(global.fetch)
      .mock.calls.find(([input, init]) => urlOf(input).includes("/businesses") && init?.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({ name: "Third Co" });
  });
});
