import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Onboarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts on the business details step", () => {
    renderOnboarding();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/tell us about your business/i)).toBeInTheDocument();
  });

  it("moves to the logo step after the details step completes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByText(/add your logo/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("navigates to the dashboard once the logo step completes, marking onboarding complete", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip this step/i }));
    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/business/onboarding/complete"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("navigates straight to the dashboard when 'skip onboarding' is clicked, marking onboarding complete", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip onboarding/i }));

    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/business/onboarding/complete"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
