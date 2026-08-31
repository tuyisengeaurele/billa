import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoadErrorBanner } from "./LoadErrorBanner";

describe("LoadErrorBanner", () => {
  it("renders the message as an alert and calls onRetry when the button is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<LoadErrorBanner message="Couldn't load items." onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load items.");

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(onRetry).toHaveBeenCalled();
  });
});
