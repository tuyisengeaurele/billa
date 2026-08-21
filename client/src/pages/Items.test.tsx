import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Items from "./Items";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderItems() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Items />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Items", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no items", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderItems();

    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument();
  });

  it("renders a list of items with formatted prices", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderItems();

    expect(await screen.findByText("Printing service")).toBeInTheDocument();
    expect(screen.getByText("5,000 RWF")).toBeInTheDocument();
  });

  it("creates an item through the modal and refreshes the list", async () => {
    let created = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/items") && init?.method === "POST") {
        created = true;
        return new Response(JSON.stringify({ item: { id: "i1", description: "New item" } }), { status: 201 });
      }
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: created
              ? [{ id: "i1", description: "New item", unitPrice: 1000, unit: "piece", isActive: true }]
              : [],
            total: created ? 1 : 0,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderItems();
    await screen.findByText(/no items yet/i);

    await user.click(screen.getAllByRole("button", { name: /add item/i })[0]);
    await user.type(screen.getByLabelText("Description"), "New item");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "1000");
    await user.click(screen.getByRole("button", { name: /save item/i }));

    await waitFor(() => expect(screen.getByText("New item")).toBeInTheDocument());
  });

  it("deactivates an item after confirming", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/items/i1") && init?.method === "PATCH") {
        isActive = false;
        return new Response(JSON.stringify({ item: { id: "i1", description: "Printing service", isActive } }), {
          status: 200,
        });
      }
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: isActive
              ? [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }]
              : [],
            total: isActive ? 1 : 0,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/no items yet/i)).toBeInTheDocument());
  });

  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderItems();
    await screen.findByText(/no items yet/i);

    expect(screen.getByLabelText("Search items")).toBeInTheDocument();
  });

  it("opens the edit modal when an item's description button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }],
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
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("button", { name: "Printing service" }));

    expect(await screen.findByText("Edit item")).toBeInTheDocument();
  });

  it("sorts by description when the Description header button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("button", { name: /^description$/i }));

    expect(screen.getByRole("button", { name: /^description ↑$/i })).toBeInTheDocument();
  });
});
