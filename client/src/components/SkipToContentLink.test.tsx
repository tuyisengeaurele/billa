import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkipToContentLink } from "./SkipToContentLink";

describe("SkipToContentLink", () => {
  it("links to the main content landmark", () => {
    render(<SkipToContentLink />);

    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main-content");
  });
});
