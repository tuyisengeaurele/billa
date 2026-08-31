import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

describe("BulkActionBar", () => {
  it("shows the total selected count, pluralized correctly", () => {
    render(
      <BulkActionBar
        activeCount={2}
        inactiveCount={1}
        noun="item"
        pluralNoun="items"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("3 items selected")).toBeInTheDocument();
  });

  it("shows only Deactivate when every selected row is active", () => {
    render(
      <BulkActionBar
        activeCount={3}
        inactiveCount={0}
        noun="item"
        pluralNoun="items"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deactivate (3)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reactivate/i })).not.toBeInTheDocument();
    expect(screen.getByText("3 items selected")).toBeInTheDocument();
  });

  it("shows both buttons for a mixed selection, and calls the right handler for each", async () => {
    const onDeactivate = vi.fn();
    const onReactivate = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkActionBar
        activeCount={2}
        inactiveCount={1}
        noun="customer"
        pluralNoun="customers"
        onDeactivate={onDeactivate}
        onReactivate={onReactivate}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deactivate (2)" }));
    expect(onDeactivate).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reactivate (1)" }));
    expect(onReactivate).toHaveBeenCalled();
  });

  it("uses the singular noun for exactly one selected", () => {
    render(
      <BulkActionBar
        activeCount={1}
        inactiveCount={0}
        noun="customer"
        pluralNoun="customers"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("1 customer selected")).toBeInTheDocument();
  });

  it("calls onClear when Clear selection is clicked", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkActionBar
        activeCount={1}
        inactiveCount={0}
        noun="item"
        pluralNoun="items"
        onDeactivate={vi.fn()}
        onReactivate={vi.fn()}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
