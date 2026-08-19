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
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ defaultTemplate: "SIDEBAR_ACCENT" }));
  });
});
