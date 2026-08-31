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

  it("runs the action and dismisses the toast when its action button is clicked", async () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <Toast
        toast={{ id: "1", variant: "success", message: "Item deactivated", action: { label: "Undo", onClick: onAction } }}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledWith("1");
  });
});
