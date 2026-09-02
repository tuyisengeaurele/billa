import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SequenceEditor } from "./SequenceEditor";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

const SEQUENCES = [
  { type: "INVOICE", prefix: "INV-", nextNumber: 3, resetYearly: false },
  { type: "PROFORMA", prefix: "PRO-", nextNumber: 1, resetYearly: false },
  { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1, resetYearly: false },
  { type: "QUOTE", prefix: "QTE-", nextNumber: 1, resetYearly: false },
  { type: "RECEIPT", prefix: "RCT-", nextNumber: 1, resetYearly: false },
  { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1, resetYearly: false },
];

describe("SequenceEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and shows the current prefix and next number for each type", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 }),
    );

    render(<SequenceEditor />);

    expect(await screen.findByDisplayValue("INV-")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    expect(screen.getByDisplayValue("RCT-")).toBeInTheDocument();
  });

  it("submits the edited prefix", async () => {
    let putBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences") && init?.method === "PUT") {
        putBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 });
      }
      return new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 });
    });

    const user = userEvent.setup();
    render(<SequenceEditor />);

    const invoicePrefixInput = await screen.findByDisplayValue("INV-");
    await user.clear(invoicePrefixInput);
    await user.type(invoicePrefixInput, "FAC-");
    await user.click(screen.getByRole("button", { name: /save numbering/i }));

    await waitFor(() =>
      expect(putBody).toContainEqual(expect.objectContaining({ type: "INVOICE", prefix: "FAC-" })),
    );
  });

  it("submits resetYearly when the checkbox is toggled on", async () => {
    let putBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences") && init?.method === "PUT") {
        putBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 });
      }
      return new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 });
    });

    const user = userEvent.setup();
    render(<SequenceEditor />);

    await screen.findByDisplayValue("INV-");
    await user.click(screen.getByLabelText("Invoices reset yearly"));
    await user.click(screen.getByRole("button", { name: /save numbering/i }));

    await waitFor(() =>
      expect(putBody).toContainEqual(expect.objectContaining({ type: "INVOICE", resetYearly: true })),
    );
  });
});
