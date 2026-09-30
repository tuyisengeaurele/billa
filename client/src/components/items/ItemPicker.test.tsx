import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemPicker } from "./ItemPicker";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

const PRINTING = { id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", taxRate: 18 };
const BREAD = { id: "i2", description: "Bread", unitPrice: 500, unit: "piece", taxRate: 0 };

function mockItems(results: unknown[], onCreate?: (body: unknown) => Response) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    if (init?.method === "POST" && onCreate) return onCreate(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ results, total: results.length, page: 1, pageSize: 50 }), { status: 200 });
  });
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Select an item" }));
  return screen.findByRole("dialog");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ItemPicker", () => {
  it("shows a prompt when no item is chosen, and the item's name once it is", () => {
    mockItems([]);
    const { rerender } = render(<ItemPicker value="" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Select an item" })).toBeInTheDocument();

    rerender(<ItemPicker value="Printing service" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Printing service" })).toBeInTheDocument();
  });

  it("opens a window listing the available items with their prices, like the customer picker", async () => {
    mockItems([PRINTING, BREAD]);
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} />);

    const dialog = await openPicker(user);

    expect(within(dialog).getByRole("heading", { name: "Select an item" })).toBeInTheDocument();
    expect(await within(dialog).findByText("Printing service")).toBeInTheDocument();
    expect(within(dialog).getByText("5,000 RWF per service")).toBeInTheDocument();
    expect(within(dialog).getByText("Bread")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /add new item/i })).toBeInTheDocument();
  });

  it("calls onSelect with the description, price and tax rate, then closes", async () => {
    mockItems([PRINTING]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={onSelect} />);

    const dialog = await openPicker(user);
    await user.click(await within(dialog).findByText("Printing service"));

    expect(onSelect).toHaveBeenCalledWith({ id: "i1", description: "Printing service", unitPrice: 5000, taxRate: 18 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("carries a VAT-exempt item's zero tax rate through, and reads a rate the API sends as text", async () => {
    mockItems([BREAD, { id: "i3", description: "Cement", unitPrice: 12500, unit: "bag", taxRate: "18.00" }]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={onSelect} />);

    let dialog = await openPicker(user);
    await user.click(await within(dialog).findByText("Bread"));
    expect(onSelect).toHaveBeenLastCalledWith({ id: "i2", description: "Bread", unitPrice: 500, taxRate: 0 });

    dialog = await openPicker(user);
    await user.click(await within(dialog).findByText("Cement"));
    expect(onSelect).toHaveBeenLastCalledWith({ id: "i3", description: "Cement", unitPrice: 12500, taxRate: 18 });
  });

  it("searches as the user types", async () => {
    const fetchSpy = mockItems([PRINTING]);
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} />);

    const dialog = await openPicker(user);
    await user.type(within(dialog).getByLabelText("Search items"), "Print");

    await vi.waitFor(() =>
      expect(fetchSpy.mock.calls.some(([input]) => urlOf(input).includes("search=Print"))).toBe(true),
    );
  });

  it("says when nothing matches", async () => {
    mockItems([]);
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} />);

    const dialog = await openPicker(user);

    expect(await within(dialog).findByText(/no items found/i)).toBeInTheDocument();
  });

  it("lets a line be typed by hand when the item is not in the catalog", async () => {
    mockItems([]);
    const onDescriptionChange = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} onDescriptionChange={onDescriptionChange} />);

    const dialog = await openPicker(user);
    await user.type(within(dialog).getByLabelText("Search items"), "Delivery fee");
    await user.click(await within(dialog).findByRole("button", { name: /use "delivery fee" as a custom line/i }));

    expect(onDescriptionChange).toHaveBeenCalledWith("Delivery fee");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not offer a custom line before anything is typed", async () => {
    mockItems([PRINTING]);
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} onDescriptionChange={vi.fn()} />);

    const dialog = await openPicker(user);

    expect(within(dialog).queryByRole("button", { name: /custom line/i })).not.toBeInTheDocument();
  });

  it("creates a new item from the same window and selects it", async () => {
    const created = { id: "i9", description: "Delivery", unitPrice: 2000, unit: "service", taxRate: "18.00" };
    const fetchSpy = mockItems([], () => new Response(JSON.stringify({ item: created }), { status: 201 }));
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={onSelect} />);

    const dialog = await openPicker(user);
    await user.click(within(dialog).getByRole("button", { name: /add new item/i }));
    expect(within(dialog).getByRole("heading", { name: "Add item" })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Description"), "Delivery");
    await user.type(within(dialog).getByLabelText(/unit price/i), "2000");
    await user.click(within(dialog).getByRole("button", { name: /save item/i }));

    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ id: "i9", description: "Delivery", unitPrice: 2000, taxRate: 18 }),
    );
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toContain("/items");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("explains a lapsed trial when saving a new item is blocked", async () => {
    mockItems([], () => new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 }));
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} />);

    const dialog = await openPicker(user);
    await user.click(within(dialog).getByRole("button", { name: /add new item/i }));
    await user.type(within(dialog).getByLabelText("Description"), "Delivery");
    await user.type(within(dialog).getByLabelText(/unit price/i), "2000");
    await user.click(within(dialog).getByRole("button", { name: /save item/i }));

    expect(await within(dialog).findByText(/your trial has ended/i)).toBeInTheDocument();
  });

  it("shows a validation error under the field", () => {
    mockItems([]);
    render(<ItemPicker value="" error="Enter a description" onSelect={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a description");
  });
});
