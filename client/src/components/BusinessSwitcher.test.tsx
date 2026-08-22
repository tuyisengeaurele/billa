import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { BusinessSwitcher } from "./BusinessSwitcher";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockFetch(businesses: { id: string; name: string }[]) {
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

  it("shows plain branding with one business and no dropdown", async () => {
    mockFetch([{ id: "b1", name: "Kigali Traders" }]);

    renderSwitcher();

    expect(await screen.findByText("Billa · Kigali Traders")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a dropdown listing every business when there is more than one", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.getByRole("button", { name: "Side Hustle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add another business/i })).toBeInTheDocument();
  });

  it("hides the add-business action once the account owns 3 businesses", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
      { id: "b3", name: "Third Co" },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.queryByRole("button", { name: /add another business/i })).not.toBeInTheDocument();
  });

  it("calls switch-business with the selected business id", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
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
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
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
