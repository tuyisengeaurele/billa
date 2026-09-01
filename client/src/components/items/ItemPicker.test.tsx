import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemPicker } from "./ItemPicker";

describe("ItemPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches items as the user types and calls onSelect with description, price, and tax rate", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", taxRate: 18 }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByLabelText("Item"));
    await user.type(screen.getByLabelText("Item"), "Printing");

    const option = await screen.findByText("Printing service");
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith({
      id: "i1",
      description: "Printing service",
      unitPrice: 5000,
      taxRate: 18,
    });
  });

  it("carries a VAT-exempt item's zero tax rate through to onSelect", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ id: "i2", description: "Bread", unitPrice: 500, unit: "piece", taxRate: 0 }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByLabelText("Item"));
    await user.type(screen.getByLabelText("Item"), "Bread");

    const option = await screen.findByText("Bread");
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: "i2", description: "Bread", unitPrice: 500, taxRate: 0 });
  });

  it("reports free-typed text so a line can be entered manually without picking a catalog item", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 10 }), { status: 200 }));
    const onDescriptionChange = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={vi.fn()} onDescriptionChange={onDescriptionChange} />);

    await user.type(screen.getByLabelText("Item"), "Delivery fee");

    expect(onDescriptionChange).toHaveBeenLastCalledWith("Delivery fee");
  });
});
