import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import * as downloadFileModule from "../lib/downloadFile";
import { ExportCsvButton } from "./ExportCsvButton";

describe("ExportCsvButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a custom label when provided", async () => {
    render(<ExportCsvButton path="/export/all" filename="billa-export.json" label="Export all data" />);

    expect(screen.getByRole("button", { name: "Export all data" })).toBeInTheDocument();
  });

  it("shows a success toast after a successful export", async () => {
    vi.spyOn(downloadFileModule, "downloadFile").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ToastTestWrapper>
        <ExportCsvButton path="/customers/export.csv" filename="customers.csv" />
      </ToastTestWrapper>,
    );

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("Exported customers.csv")).toBeInTheDocument();
  });

  it("shows an error toast when the export fails", async () => {
    vi.spyOn(downloadFileModule, "downloadFile").mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(
      <ToastTestWrapper>
        <ExportCsvButton path="/customers/export.csv" filename="customers.csv" />
      </ToastTestWrapper>,
    );

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("Couldn't export customers.csv. Try again.")).toBeInTheDocument();
  });
});
