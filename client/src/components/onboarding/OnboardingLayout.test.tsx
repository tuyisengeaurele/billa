import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingLayout } from "./OnboardingLayout";

describe("OnboardingLayout", () => {
  it("renders the step label and children", () => {
    render(
      <OnboardingLayout stepLabel="Step 1 of 2" onSkipAll={() => {}}>
        <p>step content</p>
      </OnboardingLayout>,
    );
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("step content")).toBeInTheDocument();
  });

  it("calls onSkipAll when the skip link is clicked", async () => {
    const onSkipAll = vi.fn();
    const user = userEvent.setup();
    render(
      <OnboardingLayout stepLabel="Step 1 of 2" onSkipAll={onSkipAll}>
        <p>content</p>
      </OnboardingLayout>,
    );
    await user.click(screen.getByRole("button", { name: /skip onboarding/i }));
    expect(onSkipAll).toHaveBeenCalledTimes(1);
  });
});
