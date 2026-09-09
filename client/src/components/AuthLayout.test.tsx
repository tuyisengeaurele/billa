import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthLayout } from "./AuthLayout";

function renderLayout() {
  return render(
    <MemoryRouter>
      <AuthLayout eyebrow="Welcome back" headline="Back to business." tagline="Pick up where you left off">
        <p>form content</p>
      </AuthLayout>
    </MemoryRouter>,
  );
}

describe("AuthLayout", () => {
  it("links every Billa logo back to the landing page", () => {
    // Regression test: Login/Register had no way back to "/" at all - a dead end
    // once you landed there, especially on mobile where the desktop-only left
    // panel (with its own logo) never even renders.
    renderLayout();

    const links = screen.getAllByRole("link", { name: /billa/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/");
    }
  });
});
