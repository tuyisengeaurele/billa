import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanBadge, PlanLegend } from "./planColors";

describe("PlanBadge", () => {
  it("shows the label for each plan", () => {
    const { rerender } = render(<PlanBadge plan="NONE" />);
    expect(screen.getByText("Trial")).toBeInTheDocument();

    rerender(<PlanBadge plan="MONTHLY" />);
    expect(screen.getByText("Monthly")).toBeInTheDocument();

    rerender(<PlanBadge plan="ANNUAL" />);
    expect(screen.getByText("Annual")).toBeInTheDocument();
  });
});

describe("PlanLegend", () => {
  it("shows all three plan labels", () => {
    render(<PlanLegend />);
    expect(screen.getByText("Trial")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Annual")).toBeInTheDocument();
  });
});
