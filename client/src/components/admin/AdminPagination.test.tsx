import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminPagination } from "./AdminPagination";

describe("AdminPagination", () => {
  it("shows the current page and total pages", () => {
    render(<AdminPagination page={2} totalPages={5} onPrevious={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("disables Previous on the first page and calls onPrevious otherwise", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const { rerender } = render(<AdminPagination page={1} totalPages={3} onPrevious={onPrevious} onNext={vi.fn()} />);

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    rerender(<AdminPagination page={2} totalPages={3} onPrevious={onPrevious} onNext={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it("disables Next on the last page and calls onNext otherwise", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const { rerender } = render(<AdminPagination page={3} totalPages={3} onPrevious={vi.fn()} onNext={onNext} />);

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

    rerender(<AdminPagination page={2} totalPages={3} onPrevious={vi.fn()} onNext={onNext} />);
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).toHaveBeenCalledOnce();
  });
});
