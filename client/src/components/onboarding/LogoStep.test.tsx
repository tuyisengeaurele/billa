import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogoStep } from "./LogoStep";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockSuccessfulPipeline() {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/business/logo")) {
      return new Response(JSON.stringify({ url: "/uploads/b1/logo.png" }), { status: 201 });
    }
    if (url.endsWith("/business/logo/remove-background")) {
      return new Response(
        JSON.stringify({ url: "/uploads/b1/logo-nobg.png", backgroundRemoved: true }),
        { status: 200 },
      );
    }
    if (url.endsWith("/business/logo/extract-colors")) {
      return new Response(
        JSON.stringify({ primaryColor: "#C2185B", accentColors: ["#E0F2FE", "#8F1144"], contrastRatio: 4.5 }),
        { status: 200 },
      );
    }
    if (url.endsWith("/business/logo/confirm")) {
      return new Response(JSON.stringify({ business: {} }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

const PNG_FILE = new File(["fake-image-bytes"], "logo.png", { type: "image/png" });

describe("LogoStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the upload prompt and skip link initially", () => {
    render(<LogoStep onComplete={() => {}} />);
    expect(screen.getByLabelText(/click to upload your logo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip this step/i })).toBeInTheDocument();
  });

  it("shows a loading state while the upload pipeline is running", async () => {
    vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);

    expect(await screen.findByText(/setting up your logo/i)).toBeInTheDocument();
  });

  it("runs the upload, background removal, and color extraction pipeline after a file is chosen", async () => {
    mockSuccessfulPipeline();
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);

    expect(await screen.findByRole("button", { name: /use these colors/i })).toBeInTheDocument();
    expect(screen.getByText("#C2185B")).toBeInTheDocument();
  });

  it("confirms the logo with the extracted colors and calls onComplete", async () => {
    mockSuccessfulPipeline();
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<LogoStep onComplete={onComplete} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);
    await user.click(await screen.findByRole("button", { name: /use these colors/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("lets you adjust the primary color before confirming", async () => {
    const fetchSpy = mockSuccessfulPipeline();
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);
    await screen.findByRole("button", { name: /use these colors/i });

    await user.click(screen.getByRole("button", { name: /adjust colors/i }));
    const primaryInput = screen.getByLabelText("Primary color");
    fireEvent.change(primaryInput, { target: { value: "#000000" } });
    await user.click(screen.getByRole("button", { name: /use these colors/i }));

    await waitFor(() => {
      const confirmCall = fetchSpy.mock.calls.find((call) => urlOf(call[0]).endsWith("/logo/confirm"));
      expect(confirmCall).toBeDefined();
      expect(JSON.parse(confirmCall![1]?.body as string)).toMatchObject({ primaryColor: "#000000" });
    });
  });

  it("resets to the upload prompt when 'try a different logo' is clicked", async () => {
    mockSuccessfulPipeline();
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);
    await screen.findByRole("button", { name: /use these colors/i });

    await user.click(screen.getByRole("button", { name: /try a different logo/i }));

    expect(screen.getByLabelText(/click to upload your logo/i)).toBeInTheDocument();
  });

  it("calls onComplete without confirming when Skip is clicked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<LogoStep onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: /skip this step/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows an inline error and returns to upload when the file is rejected", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_file_type" }), { status: 400 }),
    );
    const user = userEvent.setup();
    render(<LogoStep onComplete={() => {}} />);

    await user.upload(screen.getByLabelText(/click to upload your logo/i), PNG_FILE);

    expect(await screen.findByText(/couldn't be used/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/click to upload your logo/i)).toBeInTheDocument();
  });
});
