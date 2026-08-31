import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, useToastItems } from "../context/ToastContext";
import { ToastContainer } from "./ToastContainer";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success("Saved")}>
        Fire success
      </button>
      <button type="button" onClick={() => toast.error("Failed")}>
        Fire error
      </button>
    </>
  );
}

function ToastCount() {
  const { toasts } = useToastItems();
  return <p>Active toasts: {toasts.length}</p>;
}

describe("ToastContainer", () => {
  it("renders toasts pushed through useToast, newest last in the stack", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
        <ToastContainer />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Fire success" }));
    await user.click(screen.getByRole("button", { name: "Fire error" }));

    const messages = [...screen.getAllByText(/Saved|Failed/)].map((el) => el.textContent);
    expect(messages).toEqual(["Saved", "Failed"]);
  });

  it("renders nothing when there are no active toasts", () => {
    render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a success toast alive past its normal 4s lifetime while the pointer hovers it", () => {
    // Asserts against the toast count rather than DOM presence: AnimatePresence keeps the
    // exiting node mounted until its exit transition completes, and that transition is
    // driven by framer-motion's own animation-frame loop, not by these fake timers - so
    // checking for DOM removal here would really be testing animation timing, not dismissal.
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
        <ToastCount />
        <ToastContainer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fire success" }));
    const toast = screen.getByRole("status");
    expect(screen.getByText("Active toasts: 1")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Active toasts: 1")).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Active toasts: 0")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
