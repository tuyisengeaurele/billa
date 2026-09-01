import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import BusinessSettings from "./BusinessSettings";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthProvider>
          <BusinessSettings />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("BusinessSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and shows the current business profile and template", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
              { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: "123",
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
    expect(await screen.findByLabelText("Premium")).toBeChecked();
    expect(screen.getByRole("button", { name: /export all data/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dark mode|light mode/i })).toBeInTheDocument();
  });

  it("submits changed fields and the selected template", async () => {
    let patchBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
              { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business") && init?.method === "PATCH") {
        patchBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ business: {} }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "MINIMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Kigali Traders");
    await user.click(screen.getByLabelText("Premium"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ defaultTemplate: "PREMIUM" }));
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });

  it("sends null for a field cleared to blank, and the trimmed value for one that's set", async () => {
    let patchBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
              { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business") && init?.method === "PATCH") {
        patchBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ business: {} }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: "123",
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "MINIMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    const tinField = await screen.findByDisplayValue("123");
    await user.clear(tinField);
    await user.type(screen.getByLabelText("Industry"), "  Retail  ");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ tin: null, industry: "Retail" }));
  });

  it("shows and saves bank and signatory details", async () => {
    let patchBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/business") && init?.method === "PATCH") {
        patchBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ business: {} }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              bankName: null,
              bankAccountNumber: null,
              signatoryName: null,
              signatoryTitle: null,
              defaultTemplate: "MINIMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Kigali Traders");
    await user.type(screen.getByLabelText("Bank name"), "Bank of Kigali");
    await user.type(screen.getByLabelText("Bank account number"), "000123456789");
    await user.type(screen.getByLabelText("Signatory name"), "Jane Doe");
    await user.type(screen.getByLabelText("Signatory title"), "Managing Director");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(patchBody).toMatchObject({
        bankName: "Bank of Kigali",
        bankAccountNumber: "000123456789",
        signatoryName: "Jane Doe",
        signatoryTitle: "Managing Director",
      }),
    );
  });

  it("sets the brand color from a preset swatch and submits it", async () => {
    let patchBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
              { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business") && init?.method === "PATCH") {
        patchBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ business: {} }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "MINIMAL",
              primaryColor: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Kigali Traders");
    await user.click(screen.getByRole("button", { name: "Use #2563EB" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ primaryColor: "#2563EB" }));
  });

  it("shows an Add logo option when the business has no logo yet, and reveals the uploader", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "u1",
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
              logoUrl: null,
            },
            user: { id: "u1" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add a logo/i }));

    expect(await screen.findByText(/click to upload your logo/i)).toBeInTheDocument();
  });

  it("shows the current logo with a Replace option when one is already set", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "u1",
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
              logoUrl: "/uploads/logo.png",
            },
            user: { id: "u1" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByRole("button", { name: /replace logo/i })).toBeInTheDocument();
    expect(screen.getByAltText(/your business logo/i)).toBeInTheDocument();
  });

  it("uploads a signature image and saves it to the business", async () => {
    let patchBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/business/signature") && init?.method === "POST") {
        return new Response(JSON.stringify({ url: "/uploads/b1/signature.png" }), { status: 201 });
      }
      if (url.endsWith("/business") && init?.method === "PATCH") {
        patchBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ business: { ownerId: "u1", name: "Kigali Traders", signatureUrl: "/uploads/b1/signature.png" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "u1",
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
              logoUrl: null,
              signatureUrl: null,
            },
            user: { id: "u1" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(["fake-bytes"], "signature.png", { type: "image/png" });
    const input = await screen.findByLabelText(/upload signature/i);
    await user.upload(input, file);

    await waitFor(() => expect(patchBody).toMatchObject({ signatureUrl: "/uploads/b1/signature.png" }));
    expect(await screen.findByAltText(/your signature/i)).toBeInTheDocument();
  });

  it("shows the current signature with a Remove option when one is already set", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "u1",
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
              logoUrl: null,
              signatureUrl: "/uploads/b1/signature.png",
            },
            user: { id: "u1" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByAltText(/your signature/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("requires typing the current name before rename is enabled, then renames the business", async () => {
    let currentName = "Kigali Traders";
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/business") && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        currentName = body.name;
        return new Response(JSON.stringify({ business: {} }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "u1",
              name: currentName,
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
              logoUrl: null,
            },
            user: { id: "u1", email: "owner@example.com" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^rename$/i }));
    const dialog = await screen.findByRole("dialog", { name: /rename business/i });
    const confirmButton = within(dialog).getByRole("button", { name: /^rename$/i });
    expect(confirmButton).toBeDisabled();

    await user.clear(within(dialog).getByLabelText(/new business name/i));
    await user.type(within(dialog).getByLabelText(/new business name/i), "Musanze Traders");
    await user.type(within(dialog).getByLabelText(/type/i), "Kigali Traders");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(await screen.findByText("Musanze Traders")).toBeInTheDocument();
    expect(await screen.findByText("Business renamed")).toBeInTheDocument();
  });

  it("requires typing your email before delete is enabled, then deletes the account and redirects to login", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(JSON.stringify({ sequences: [] }), { status: 200 });
      }
      if (url.endsWith("/auth/me") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "u1",
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "PREMIUM",
              logoUrl: null,
            },
            user: { id: "u1", email: "owner@example.com" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthProvider>
          <Routes>
            <Route path="/settings" element={<BusinessSettings />} />
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /delete my account/i }));
    const dialog = await screen.findByRole("dialog", { name: /delete account/i });
    const confirmButton = within(dialog).getByRole("button", { name: /^delete account$/i });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/type/i), "owner@example.com");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("shows an error message when the business profile fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
              { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your business settings/i);
  });

  it("disables settings fields and hides Save for a member who isn't the owner", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
              { type: "CREDIT_NOTE", prefix: "CN-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: { id: "member-1", email: "member@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business")) {
        return new Response(
          JSON.stringify({
            business: {
              ownerId: "owner-1",
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "MINIMAL",
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/members") || url.endsWith("/business/invites")) {
        return new Response(JSON.stringify({ error: "not_owner" }), { status: 403 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    await screen.findByText("Kigali Traders");
    expect(screen.getByLabelText("TIN")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^rename$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only the business owner can change these settings/i)).toBeInTheDocument();
  });

  it("shows an error message when document numbering fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "MINIMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });

    renderPage();

    expect(await screen.findByText(/couldn't load document numbering/i)).toBeInTheDocument();
  });
});
