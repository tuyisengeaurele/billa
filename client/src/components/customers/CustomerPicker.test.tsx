import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerPicker } from "./CustomerPicker";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("CustomerPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a modal, searches customers, and selects one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ id: "c1", name: "Kigali Traders", phone: "0788000000" }],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.type(screen.getByLabelText("Search customers"), "Kigali");

    const option = await screen.findByText("Kigali Traders");
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: "c1", name: "Kigali Traders" });
    await waitFor(() => expect(screen.queryByLabelText("Search customers")).not.toBeInTheDocument());
  });

  it("shows the selected customer's name on the trigger button", () => {
    render(<CustomerPicker value="Kigali Traders" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /kigali traders/i })).toBeInTheDocument();
  });

  it("creates a new customer from within the modal and selects it", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers") && init?.method === "POST") {
        return new Response(JSON.stringify({ customer: { id: "c2", name: "New Co", phone: null } }), { status: 201 });
      }
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 50 }), { status: 200 });
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /select a customer/i }));
    await user.click(screen.getByRole("button", { name: /add new customer/i }));
    await user.type(screen.getByLabelText("Name"), "New Co");
    await user.click(screen.getByRole("button", { name: /save customer/i }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: "c2", name: "New Co" }));
  });
});
