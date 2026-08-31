import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import Items from "./Items";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderItems() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter>
        <AuthProvider>
          <Items />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("Items", () => {
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
    expect(await screen.findByText("Item added")).toBeInTheDocument();
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

    const dialog = await screen.findByRole("dialog", { name: /deactivate item/i });
    await user.click(within(dialog).getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/no items yet/i)).toBeInTheDocument());
    expect(await screen.findByText("Item deactivated")).toBeInTheDocument();
  });

  it("reactivates an item when Undo is clicked on the deactivation toast", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/items/i1") && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        isActive = body.isActive;
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
    const dialog = await screen.findByRole("dialog", { name: /deactivate item/i });
    await user.click(within(dialog).getByRole("button", { name: /deactivate/i }));
    await screen.findByText(/no items yet/i);

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Printing service")).toBeInTheDocument();
    expect(await screen.findByText("Item reactivated")).toBeInTheDocument();
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

  it("shows a subscription message when creating an item is blocked by a lapsed trial", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/items") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 });
      }
      if (url.includes("/items")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
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

    expect(await screen.findByText(/trial has ended/i)).toBeInTheDocument();
  });

  it("retries the list after a failed load and shows results once it succeeds", async () => {
    let shouldFail = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        if (shouldFail) return new Response("{}", { status: 500 });
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

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the list.");
    shouldFail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Printing service")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("selects rows and bulk-deactivates them, with Undo reactivating the batch", async () => {
    let activeMap: Record<string, boolean> = { i1: true, i2: true };
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      const idMatch = url.match(/\/items\/(i\d)$/);
      if (idMatch && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        activeMap[idMatch[1]] = body.isActive;
        return new Response(JSON.stringify({ item: { id: idMatch[1], isActive: body.isActive } }), { status: 200 });
      }
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: activeMap.i1 },
              { id: "i2", description: "Delivery box", unitPrice: 1000, unit: "piece", isActive: activeMap.i2 },
            ].filter((item) => activeMap[item.id]),
            total: Object.values(activeMap).filter(Boolean).length,
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

    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("2 items selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: /deactivate items/i });
    await user.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));

    await waitFor(() => expect(screen.getByText(/no items yet/i)).toBeInTheDocument());
    expect(await screen.findByText("2 items deactivated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Printing service")).toBeInTheDocument();
    expect(await screen.findByText("Delivery box")).toBeInTheDocument();
    expect(await screen.findByText("2 items reactivated")).toBeInTheDocument();
  });

  it("shows both Deactivate and Reactivate when the selection is mixed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true },
              { id: "i2", description: "Delivery box", unitPrice: 1000, unit: "piece", isActive: false },
            ],
            total: 2,
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

    await user.click(screen.getByRole("checkbox", { name: "Select Printing service" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Delivery box" }));

    expect(screen.getByRole("button", { name: "Deactivate (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate (1)" })).toBeInTheDocument();
  });
});
