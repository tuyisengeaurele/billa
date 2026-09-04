import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

describe("RouteLoadingFallback", () => {
  it("shows a loading indicator", () => {
    render(<RouteLoadingFallback />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
