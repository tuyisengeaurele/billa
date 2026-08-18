import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchDropdown } from "./SearchDropdown";

describe("SearchDropdown", () => {
  it("calls onQueryChange as the user types", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query=""
        onQueryChange={onQueryChange}
        options={[]}
        isLoading={false}
        onSelect={() => {}}
      />,
    );
    await user.type(screen.getByLabelText("Test"), "a");
    expect(onQueryChange).toHaveBeenCalledWith("a");
  });

  it("shows options when open and calls onSelect when one is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query=""
        onQueryChange={() => {}}
        options={[{ id: "1", label: "Kigali Traders" }]}
        isLoading={false}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByLabelText("Test"));
    await user.click(await screen.findByText("Kigali Traders"));
    expect(onSelect).toHaveBeenCalledWith({ id: "1", label: "Kigali Traders" });
  });

  it("shows a loading message while isLoading is true", async () => {
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query=""
        onQueryChange={() => {}}
        options={[]}
        isLoading={true}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Test"));
    expect(await screen.findByText(/searching/i)).toBeInTheDocument();
  });

  it("shows a no-results message when there are no options and not loading", async () => {
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query="xyz"
        onQueryChange={() => {}}
        options={[]}
        isLoading={false}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Test"));
    expect(await screen.findByText(/no results/i)).toBeInTheDocument();
  });
});
