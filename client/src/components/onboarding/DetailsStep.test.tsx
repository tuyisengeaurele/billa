import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailsStep } from "./DetailsStep";

describe("DetailsStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the business name prefilled and the six optional detail fields", () => {
    render(<DetailsStep initialName="My Business" onComplete={() => {}} />);
    expect(screen.getByDisplayValue("My Business")).toBeInTheDocument();
    expect(screen.getByLabelText("TIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Industry")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Business email")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.getByLabelText("RRA EBM number")).toBeInTheDocument();
  });

  it("calls onComplete without a network request when Skip is clicked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep initialName="My Business" onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("saves the prefilled name alone when Continue is clicked with nothing else filled in", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep initialName="My Business" onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ name: "My Business" });
  });

  it("sends the name plus any filled-in optional fields on Continue", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep initialName="My Business" onComplete={onComplete} />);

    await user.type(screen.getByLabelText("TIN"), "123456789");
    await user.type(screen.getByLabelText("Phone"), "+250788000000");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "My Business",
      tin: "123456789",
      phone: "+250788000000",
    });
  });

  it("marks the business name field invalid when cleared", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep initialName="My Business" onComplete={onComplete} />);

    await user.clear(screen.getByLabelText("Business name"));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/enter your business name/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a validation error for an invalid business email and does not submit", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep initialName="My Business" onComplete={onComplete} />);

    await user.type(screen.getByLabelText("Business email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/enter a valid business email/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows an error banner and does not advance when the save fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<DetailsStep initialName="My Business" onComplete={onComplete} />);

    await user.type(screen.getByLabelText("TIN"), "123456789");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/couldn't save those details/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
