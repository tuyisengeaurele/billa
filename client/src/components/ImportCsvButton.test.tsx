import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import { CUSTOMER_IMPORT, ITEM_IMPORT } from "../lib/importConfigs";
import { ImportCsvButton } from "./ImportCsvButton";

afterEach(() => {
  vi.restoreAllMocks();
});

function csvFile(text: string) {
  return new File([text], "data.csv", { type: "text/csv" });
}

async function openAndUpload(text: string, config = CUSTOMER_IMPORT, onImported = vi.fn()) {
  const user = userEvent.setup();
  render(
    <ToastTestWrapper>
      <ImportCsvButton config={config} onImported={onImported} />
    </ToastTestWrapper>,
  );
  await user.click(screen.getByRole("button", { name: /import csv/i }));
  await user.upload(screen.getByLabelText(/csv file/i), csvFile(text));
  return { user, onImported };
}

describe("ImportCsvButton", () => {
  it("guesses the column mapping and counts the rows that are ready", async () => {
    await openAndUpload("Customer Name,Phone Number\nAcme Ltd,0788123456\nBeta Co,0788000000\n,0788111111");

    expect(await screen.findByText(/found 3 rows/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name \(required\)/i)).toHaveDisplayValue("Customer Name");
    expect(screen.getByLabelText("Phone")).toHaveDisplayValue("Phone Number");
    expect(screen.getByText(/2 of 3 rows are ready to import/i)).toBeInTheDocument();
  });

  it("sends the mapped rows and shows what was created, skipped and left out", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          created: 1,
          skipped: [{ row: 2, reason: "Already a customer with this name" }],
          invalid: [{ row: 3, error: "Enter a customer name" }],
        }),
        { status: 200 },
      ),
    );
    const { user, onImported } = await openAndUpload("Name,Phone\nAcme Ltd,0788123456\nBeta,0788000000\n,1");

    await user.click(await screen.findByRole("button", { name: /import 2 customers/i }));

    expect(await screen.findByText(/added 1 customers to your list/i)).toBeInTheDocument();
    expect(screen.getByText(/row 2: already a customer with this name/i)).toBeInTheDocument();
    expect(screen.getByText(/row 3: enter a customer name/i)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/customers/import");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.rows[0]).toEqual({ name: "Acme Ltd", phone: "0788123456", email: "", tin: "", address: "" });
  });

  it("blocks the import until the required column is chosen", async () => {
    await openAndUpload("Whatever,Other\nAcme,1");

    expect(await screen.findByText(/choose a column for name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import 0 customers/i })).toBeDisabled();
  });

  it("explains a file with no data rows", async () => {
    await openAndUpload("Name,Phone");

    expect(await screen.findByText(/no data rows/i)).toBeInTheDocument();
  });

  it("refuses a file with more rows than one import can take", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => `Customer ${i}`).join("\n");
    await openAndUpload(`Name\n${rows}`);

    expect(await screen.findByText(/up to 500 rows at a time/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import 501 customers/i })).toBeDisabled();
  });

  it("imports items with prices read from the file", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ created: 1, skipped: [], invalid: [] }), { status: 200 }),
    );
    const { user } = await openAndUpload("Item,Price\nCement,\"12,500\"", ITEM_IMPORT);

    await user.click(await screen.findByRole("button", { name: /import 1 items/i }));

    await waitFor(() => expect(screen.getByText(/added 1 items to your list/i)).toBeInTheDocument());
  });

  it("shows an error and keeps the file when the import fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    const { user } = await openAndUpload("Name\nAcme Ltd");

    await user.click(await screen.findByRole("button", { name: /import 1 customers/i }));

    expect(await screen.findByText(/couldn't import this file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import 1 customers/i })).toBeEnabled();
  });
});
