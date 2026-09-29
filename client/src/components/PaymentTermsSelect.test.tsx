import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PaymentTermsSelect } from "./PaymentTermsSelect";

describe("PaymentTermsSelect", () => {
  it("shows the preset that matches the two dates", () => {
    render(<PaymentTermsSelect label="Payment terms" issueDate="2026-09-01" dueDate="2026-10-01" onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Payment terms")).toHaveValue("30");
  });

  it("shows Custom when the gap is not a preset", () => {
    render(<PaymentTermsSelect label="Payment terms" issueDate="2026-09-01" dueDate="2026-09-12" onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Payment terms")).toHaveValue("custom");
  });

  it("sets the due date from the issue date when a preset is chosen", async () => {
    const onSelect = vi.fn();
    render(<PaymentTermsSelect label="Payment terms" issueDate="2026-09-01" dueDate="2026-09-12" onSelect={onSelect} />);

    await userEvent.selectOptions(screen.getByLabelText("Payment terms"), "14");

    expect(onSelect).toHaveBeenCalledWith("2026-09-15");
  });

  it("leaves the due date alone when Custom is chosen", async () => {
    const onSelect = vi.fn();
    render(<PaymentTermsSelect label="Payment terms" issueDate="2026-09-01" dueDate="2026-10-01" onSelect={onSelect} />);

    await userEvent.selectOptions(screen.getByLabelText("Payment terms"), "custom");

    expect(onSelect).not.toHaveBeenCalled();
  });
});
