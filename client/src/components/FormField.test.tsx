import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FormField } from "./FormField";

describe("FormField", () => {
  it("associates the label with the input via id", () => {
    render(<FormField id="email" label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows the error message and marks the input invalid", () => {
    render(<FormField id="email" label="Email" error="Invalid email" />);
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not mark the input invalid when there is no error", () => {
    render(<FormField id="email" label="Email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
  });

  it("does not render a visibility toggle for non-password fields", () => {
    render(<FormField id="email" label="Email" type="email" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toggles password visibility when the show/hide button is clicked", async () => {
    const user = userEvent.setup();
    render(<FormField id="password" label="Password" type="password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input).toHaveAttribute("type", "password");
  });
});
