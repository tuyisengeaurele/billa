import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Landing from "./Landing";

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing", () => {
  it("shows the headline", () => {
    renderLanding();

    expect(screen.getByRole("heading", { name: /stop building invoices by hand/i })).toBeInTheDocument();
  });

  it("shows both pricing figures and mentions the free trial", () => {
    renderLanding();

    expect(screen.getByText("6,500 RWF")).toBeInTheDocument();
    expect(screen.getByText("65,000 RWF")).toBeInTheDocument();
    expect(screen.getAllByText(/14 days free|14-day free trial/i).length).toBeGreaterThan(0);
  });

  it("links the primary CTA to registration and the login links to login", () => {
    renderLanding();

    const ctaLinks = screen.getAllByRole("link", { name: /start free trial/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => expect(link).toHaveAttribute("href", "/register"));

    const loginLinks = screen.getAllByRole("link", { name: /^log in$/i });
    expect(loginLinks.length).toBeGreaterThan(0);
    loginLinks.forEach((link) => expect(link).toHaveAttribute("href", "/login"));
  });

  it("does not claim automatic RRA or EBM reporting", () => {
    renderLanding();

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/automatically (report|file|submit).{0,40}(rra|ebm)/i);
    expect(bodyText).not.toMatch(/(rra|ebm) compliant/i);
  });
});
