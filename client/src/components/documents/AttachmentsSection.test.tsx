import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastTestWrapper } from "../../test/ToastTestWrapper";
import { AttachmentsSection, type DocumentAttachment } from "./AttachmentsSection";

afterEach(() => {
  vi.restoreAllMocks();
});

const SCAN: DocumentAttachment = {
  id: "a1",
  fileName: "po-scan.png",
  url: "/uploads/biz1/abc.png",
  contentType: "image/png",
  sizeBytes: 250 * 1024,
};

function renderSection(attachments: DocumentAttachment[], onChanged = vi.fn()) {
  render(
    <ToastTestWrapper>
      <AttachmentsSection documentId="d1" attachments={attachments} onChanged={onChanged} />
    </ToastTestWrapper>,
  );
  return onChanged;
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

describe("AttachmentsSection", () => {
  it("explains what attachments are when there are none", () => {
    renderSection([]);

    expect(screen.getByText(/purchase order or proof of delivery/i)).toBeInTheDocument();
  });

  it("lists each file with its size and a link to open it", () => {
    renderSection([SCAN]);

    const link = screen.getByRole("link", { name: "po-scan.png" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/uploads/biz1/abc.png"));
    expect(screen.getByText("250 KB")).toBeInTheDocument();
  });

  it("uploads the chosen file and asks the page to reload", async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: init?.method, body: init?.body });
      return new Response(JSON.stringify({ attachment: SCAN }), { status: 201 });
    });
    const onChanged = renderSection([]);

    const file = new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" });
    await userEvent.setup().upload(screen.getByLabelText("Attach a file", { selector: "input" }), file);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls[0]!.url).toMatch(/\/documents\/d1\/attachments$/);
    expect(calls[0]!.method).toBe("POST");
    expect((calls[0]!.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("says why a file was refused", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ error: "invalid_file_type" }), { status: 400 }),
    );
    renderSection([]);

    // The picker filters by type, but the server has the last word, so let the wrong file through.
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText("Attach a file", { selector: "input" }), new File(["x"], "notes.txt"));

    expect(await screen.findByText(/attach a pdf, png, jpg or webp file/i)).toBeInTheDocument();
  });

  it("removes a file", async () => {
    const calls: { url: string; method?: string }[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: init?.method });
      return new Response(null, { status: 204 });
    });
    const onChanged = renderSection([SCAN]);

    await userEvent.setup().click(screen.getByRole("button", { name: "Remove po-scan.png" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({ method: "DELETE" });
    expect(calls[0]!.url).toMatch(/\/documents\/d1\/attachments\/a1$/);
  });

  it("stops offering uploads at five files", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ ...SCAN, id: `a${i}`, fileName: `scan-${i}.png` }));
    renderSection(five);

    expect(screen.getByRole("button", { name: "Attach a file" })).toBeDisabled();
  });
});
