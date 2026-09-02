import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectAllCheckbox } from "./SelectAllCheckbox";

describe("SelectAllCheckbox", () => {
  it("is unchecked and not indeterminate when nothing is selected", () => {
    render(<SelectAllCheckbox checked={false} indeterminate={false} onChange={() => {}} ariaLabel="Select all" />);

    const checkbox = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(false);
  });

  it("is fully checked when everything is selected", () => {
    render(<SelectAllCheckbox checked={true} indeterminate={false} onChange={() => {}} ariaLabel="Select all" />);

    const checkbox = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.indeterminate).toBe(false);
  });

  it("shows the indeterminate state when only some rows are selected", () => {
    render(<SelectAllCheckbox checked={false} indeterminate={true} onChange={() => {}} ariaLabel="Select all" />);

    const checkbox = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    expect(checkbox.indeterminate).toBe(true);
  });

  it("calls onChange when clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SelectAllCheckbox checked={false} indeterminate={false} onChange={onChange} ariaLabel="Select all" />);

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
