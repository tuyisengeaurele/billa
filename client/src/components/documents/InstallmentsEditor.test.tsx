import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstallmentsEditor, type PlanRow } from "./InstallmentsEditor";

const START: PlanRow[] = [
  { label: "Deposit", amount: 0, dueDate: "2026-10-01" },
  { label: "Balance", amount: 0, dueDate: "2026-11-01" },
];

function Harness({ initial = START, total = 100000, onRows }: { initial?: PlanRow[]; total?: number; onRows?: (rows: PlanRow[]) => void }) {
  const [rows, setRows] = useState(initial);
  return (
    <InstallmentsEditor
      total={total}
      issueDate="2026-10-01"
      rows={rows}
      onChange={(next) => {
        setRows(next);
        onRows?.(next);
      }}
    />
  );
}

describe("InstallmentsEditor", () => {
  it("shows the deposit as typed and works out the balance as whatever is left", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText("Amount for instalment 1"), "40000");

    expect(screen.getByLabelText("Amount for instalment 2")).toHaveValue("60,000");
    expect(screen.getByLabelText("Amount for instalment 2")).toHaveAttribute("readonly");
    expect(screen.getByText(/instalments add up to the total/i)).toBeInTheDocument();
  });

  it("turns a percentage into an amount", async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);

    await user.type(screen.getByLabelText("Percent for instalment 1"), "30");

    expect(onRows).toHaveBeenLastCalledWith([
      { label: "Deposit", amount: 30000, dueDate: "2026-10-01" },
      { label: "Balance", amount: 0, dueDate: "2026-11-01" },
    ]);
    expect(screen.getByLabelText("Amount for instalment 1")).toHaveValue("30000");
    expect(screen.getByLabelText("Amount for instalment 2")).toHaveValue("70,000");
  });

  it("shows the balance as a percentage too", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText("Amount for instalment 1"), "25000");

    expect(screen.getByLabelText("Percent for instalment 2")).toHaveValue("75");
  });

  it("lets the name and the due date of each instalment be changed", async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);

    await user.clear(screen.getByLabelText("Name of instalment 1"));
    await user.type(screen.getByLabelText("Name of instalment 1"), "Advance");
    await user.clear(screen.getByLabelText("Due date of instalment 2"));
    await user.type(screen.getByLabelText("Due date of instalment 2"), "2026-12-15");

    const last = onRows.mock.calls.at(-1)![0] as PlanRow[];
    expect(last[0]!.label).toBe("Advance");
    expect(last[1]!.dueDate).toBe("2026-12-15");
  });

  it("adds an instalment before the balance, and removes one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /remove instalment/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add instalment/i }));

    expect(screen.getByLabelText("Amount for instalment 3")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Name of instalment 3")).toHaveValue("Balance");

    await user.click(screen.getByRole("button", { name: /remove instalment 2/i }));
    expect(screen.queryByLabelText("Amount for instalment 3")).not.toBeInTheDocument();
  });

  it("stops at twelve instalments", async () => {
    const user = userEvent.setup();
    const many: PlanRow[] = Array.from({ length: 12 }, (_, i) => ({ label: "", amount: 1000, dueDate: `2026-10-${String(i + 1).padStart(2, "0")}` }));
    render(<Harness initial={many} />);

    expect(screen.getByRole("button", { name: /add instalment/i })).toBeDisabled();
    await user.hover(screen.getByRole("button", { name: /add instalment/i }));
  });

  it("splits the total evenly, leaving the balance as the remainder", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[...START, { label: "Balance", amount: 0, dueDate: "2026-12-01" }]} total={100000} />);

    await user.click(screen.getByRole("button", { name: /split evenly/i }));

    expect(screen.getByLabelText("Amount for instalment 1")).toHaveValue("33333");
    expect(screen.getByLabelText("Amount for instalment 2")).toHaveValue("33333");
    expect(screen.getByLabelText("Amount for instalment 3")).toHaveValue("33,334");
  });

  it("warns when the earlier instalments already reach the total", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText("Amount for instalment 1"), "100000");

    expect(screen.getByRole("alert")).toHaveTextContent(/leave something for the last instalment/i);
  });

  it("says when there is nothing to split yet", () => {
    render(<Harness total={0} />);

    expect(screen.getByText(/add your line items first/i)).toBeInTheDocument();
  });

  it("keeps each date from being before the issue date", () => {
    render(<Harness />);

    const date = screen.getByLabelText("Due date of instalment 1");
    expect(date).toHaveAttribute("min", "2026-10-01");
    expect(within(date.closest("div")!.parentElement!).getByLabelText("Name of instalment 1")).toBeInTheDocument();
  });
});
