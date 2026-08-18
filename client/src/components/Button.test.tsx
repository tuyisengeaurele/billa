import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children when not loading", () => {
    render(<Button>Log in</Button>);
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("hides children and disables the button while loading", () => {
    render(<Button isLoading>Log in</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.queryByText("Log in")).not.toBeInTheDocument();
  });
});
