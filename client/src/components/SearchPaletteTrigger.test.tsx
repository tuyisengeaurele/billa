import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchPaletteTrigger } from "./SearchPaletteTrigger";

describe("SearchPaletteTrigger", () => {
  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<SearchPaletteTrigger onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: /search/i }));

    expect(onClick).toHaveBeenCalled();
  });

  it("shows a keyboard shortcut hint", () => {
    render(<SearchPaletteTrigger onClick={vi.fn()} />);

    expect(screen.getByText(/K$/)).toBeInTheDocument();
  });
});
