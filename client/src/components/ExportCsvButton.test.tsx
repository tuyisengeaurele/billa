import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportCsvButton } from "./ExportCsvButton";

describe("ExportCsvButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the file when clicked", async () => {
    if (!URL.createObjectURL) URL.createObjectURL = () => "";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let requestedUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      requestedUrl = typeof input === "string" ? input : input.toString();
      return new Response(new Blob(["a,b\n1,2"], { type: "text/csv" }), { status: 200 });
    });

    const user = userEvent.setup();
    render(<ExportCsvButton path="/customers/export.csv" filename="customers.csv" />);

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => expect(requestedUrl).toContain("/customers/export.csv"));
  });

  it("uses a custom label when provided", async () => {
    render(<ExportCsvButton path="/export/all" filename="billa-export.json" label="Export all data" />);

    expect(screen.getByRole("button", { name: "Export all data" })).toBeInTheDocument();
  });

  it("shows an error message when the download fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 500 }));

    const user = userEvent.setup();
    render(<ExportCsvButton path="/customers/export.csv" filename="customers.csv" />);

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't export customers\.csv/i);
  });
});
