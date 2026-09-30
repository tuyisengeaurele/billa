import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Currency } from "@billa/shared";
import { MoneyInput } from "./MoneyInput";

function Harness({ currency, initial = 0, onMinor }: { currency: Currency; initial?: number; onMinor?: (v: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <MoneyInput
      aria-label="Price"
      currency={currency}
      value={value}
      onChange={(minor) => {
        setValue(minor);
        onMinor?.(minor);
      }}
    />
  );
}

describe("MoneyInput", () => {
  it("reports cents when a dollar amount is typed", async () => {
    const onMinor = vi.fn();
    render(<Harness currency="USD" onMinor={onMinor} />);

    await userEvent.setup().type(screen.getByLabelText("Price"), "12.5");

    expect(onMinor).toHaveBeenLastCalledWith(1250);
  });

  it("shows an incoming amount in whole units", () => {
    render(<Harness currency="USD" initial={125050} />);

    expect(screen.getByLabelText("Price")).toHaveValue("1250.5");
  });

  it("takes only whole francs for RWF and ignores a decimal point", async () => {
    const onMinor = vi.fn();
    render(<Harness currency="RWF" onMinor={onMinor} />);

    await userEvent.setup().type(screen.getByLabelText("Price"), "5000.75");

    expect(onMinor).toHaveBeenLastCalledWith(500075);
  });

  it("stops at two decimals for dollars", async () => {
    render(<Harness currency="USD" />);

    await userEvent.setup().type(screen.getByLabelText("Price"), "1.234");

    expect(screen.getByLabelText("Price")).toHaveValue("1.23");
  });

  it("re-reads the amount when the currency changes", () => {
    const { rerender } = render(<MoneyInput aria-label="Price" currency="RWF" value={1000} onChange={() => {}} />);
    expect(screen.getByLabelText("Price")).toHaveValue("1000");

    rerender(<MoneyInput aria-label="Price" currency="USD" value={1000} onChange={() => {}} />);

    expect(screen.getByLabelText("Price")).toHaveValue("10");
  });
});
