import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test">
        <p>content</p>
      </Modal>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders the title and children when open", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    expect(screen.getByText("Add customer")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel content is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog when it opens", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("traps Tab focus within the dialog's focusable elements, wrapping at both ends", async () => {
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={() => {}} title="Add customer">
        <input aria-label="Name" />
        <button type="button">Save</button>
      </Modal>,
    );
    const closeButton = screen.getByRole("button", { name: /close/i });
    const nameInput = screen.getByLabelText("Name");
    const saveButton = screen.getByRole("button", { name: "Save" });

    expect(document.activeElement).toBe(closeButton);

    await user.tab();
    expect(document.activeElement).toBe(nameInput);
    await user.tab();
    expect(document.activeElement).toBe(saveButton);
    await user.tab();
    expect(document.activeElement).toBe(closeButton);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(saveButton);
  });

  it("restores focus to the trigger element when the dialog closes", async () => {
    function Wrapper() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Add customer">
            <p>content</p>
          </Modal>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Wrapper />);
    const triggerButton = screen.getByRole("button", { name: "Open" });

    await user.click(triggerButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(triggerButton);
  });
});
