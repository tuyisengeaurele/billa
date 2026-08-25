import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import BusinessSettings from "./BusinessSettings";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <AuthProvider>
        <BusinessSettings />
      </AuthProvider>
    </MemoryRouter>,
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
              defaultTemplate: "FORMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByDisplayValue("Kigali Traders")).toBeInTheDocument();
    expect(await screen.findByLabelText("Formal")).toBeChecked();
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

    await screen.findByDisplayValue("Kigali Traders");
    await user.click(screen.getByLabelText("Sidebar accent"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ defaultTemplate: "SIDEBAR_ACCENT" }));
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

    await screen.findByDisplayValue("Kigali Traders");
    await user.click(screen.getByRole("button", { name: "Use #2563EB" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ primaryColor: "#2563EB" }));
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
