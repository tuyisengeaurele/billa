import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "../context/ToastContext";
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
});
