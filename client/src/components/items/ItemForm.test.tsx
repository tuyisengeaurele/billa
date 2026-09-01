import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemForm } from "./ItemForm";

describe("ItemForm", () => {
  it("renders with the first preset unit selected by default", () => {
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("Unit")).toHaveValue("piece");
  });

  it("defaults the tax rate to 18", () => {
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={() => {}} />);
    expect(screen.getByLabelText(/tax rate/i)).toHaveValue(18);
  });

  it("requires a description", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(await screen.findByText(/enter a description/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits with a preset unit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Description"), "Printing service");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "5000");
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "service" } });
    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      description: "Printing service",
      unitPrice: 5000,
      unit: "service",
      taxRate: 18,
    });
  });

  it("submits a custom tax rate for a VAT-exempt item", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Description"), "Bread");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "500");
    const taxRateInput = screen.getByLabelText(/tax rate/i);
    await user.clear(taxRateInput);
    await user.type(taxRateInput, "0");
    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(onSubmit).toHaveBeenCalledWith({ description: "Bread", unitPrice: 500, unit: "piece", taxRate: 0 });
  });

  it("reveals a custom unit field when 'Other' is selected and submits its value", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Description"), "Custom crate");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "2000");
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "other" } });
    await user.type(screen.getByLabelText("Custom unit"), "crate");
    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      description: "Custom crate",
      unitPrice: 2000,
      unit: "crate",
      taxRate: 18,
    });
  });

  it("pre-fills from initialValues and shows the custom field when the unit isn't a preset", () => {
    render(
      <ItemForm
        initialValues={{ description: "Custom crate", unitPrice: 2000, unit: "crate", taxRate: 0 }}
        isSubmitting={false}
        apiError={null}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByLabelText("Description")).toHaveValue("Custom crate");
    expect(screen.getByLabelText("Custom unit")).toHaveValue("crate");
    expect(screen.getByLabelText(/tax rate/i)).toHaveValue(0);
  });
});
