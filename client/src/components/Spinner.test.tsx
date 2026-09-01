import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("announces loading state to assistive tech", () => {
    render(<Spinner />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("accepts a custom label", () => {
    render(<Spinner label="Loading customers" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading customers");
  });
});
