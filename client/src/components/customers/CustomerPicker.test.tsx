import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerPicker } from "./CustomerPicker";

describe("CustomerPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches customers as the user types and calls onSelect when one is picked", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ id: "c1", name: "Kigali Traders", phone: "0788000000" }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByLabelText("Customer"));
    await user.type(screen.getByLabelText("Customer"), "Kigali");

    const option = await screen.findByText("Kigali Traders");
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: "c1", name: "Kigali Traders" });
  });
});
