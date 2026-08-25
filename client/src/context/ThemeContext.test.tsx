import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      current: {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
  });

  it("applies the theme to document.documentElement so it works outside AppLayout too", async () => {
    localStorage.setItem("billa-theme", "light");
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(screen.getByRole("button", { name: /current: light/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText(/current: dark/i)).toBeInTheDocument();
  });

  it("persists the choice across a remount", () => {
    localStorage.setItem("billa-theme", "dark");

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("billa-theme")).toBe("dark");
  });
});
