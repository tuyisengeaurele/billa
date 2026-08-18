import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerForm } from "./CustomerForm";

describe("CustomerForm", () => {
  it("renders all fields empty when there are no initial values", () => {
    render(<CustomerForm isSubmitting={false} apiError={null} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("TIN")).toHaveValue("");
  });

  it("pre-fills fields from initialValues", () => {
    render(
      <CustomerForm
        initialValues={{ name: "Kigali Traders", tin: "123456789" }}
        isSubmitting={false}
        apiError={null}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Kigali Traders");
    expect(screen.getByLabelText("TIN")).toHaveValue("123456789");
  });

  it("requires a name", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /save customer/i }));

    expect(await screen.findByText(/enter a customer name/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits only the filled-in optional fields", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Kigali Traders");
    await user.type(screen.getByLabelText("TIN"), "123456789");
    await user.click(screen.getByRole("button", { name: /save customer/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Kigali Traders", tin: "123456789" });
  });

  it("shows the api error banner when provided", () => {
    render(<CustomerForm isSubmitting={false} apiError="Something went wrong." onSubmit={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
  });
});
