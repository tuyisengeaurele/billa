import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders a success toast as a polite status message with no close button", () => {
    render(<Toast toast={{ id: "1", variant: "success", message: "Item saved" }} onDismiss={vi.fn()} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Item saved");
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("renders an error toast as an alert with a close button that dismisses it", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <Toast toast={{ id: "err-1", variant: "error", message: "Couldn't save. Try again." }} onDismiss={onDismiss} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save. Try again.");

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith("err-1");
  });
});
