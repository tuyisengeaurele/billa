import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { TwoFactorSection } from "./TwoFactorSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderSection(meResponse: { user: { id: string; email: string; totpEnabled: boolean } }) {
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({ ...meResponse, business: { id: "b1", name: "Kigali Traders" } }),
        { status: 200 },
      );
    }
    if (url.endsWith("/auth/2fa/setup")) {
      return new Response(
        JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUrl: "otpauth://totp/Billa:owner@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Billa",
          qrCodeDataUri: "data:image/png;base64,abc123",
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/auth/2fa/verify")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      if (body.code !== "654321") {
        return new Response(JSON.stringify({ error: "invalid_code" }), { status: 400 });
      }
      return new Response(JSON.stringify({ backupCodes: ["AAAA111111", "BBBB222222"] }), { status: 200 });
    }
    if (url.endsWith("/auth/2fa/disable")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      if (body.code !== "111222") {
        return new Response(JSON.stringify({ error: "invalid_code" }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  });

  return render(
    <AuthProvider>
      <TwoFactorSection />
    </AuthProvider>,
  );
}

describe("TwoFactorSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("walks through setup, showing the QR code then the backup codes on a correct confirm code", async () => {
    const user = userEvent.setup();
    renderSection({ user: { id: "u1", email: "owner@example.com", totpEnabled: false } });

    await user.click(await screen.findByRole("button", { name: /set up two-factor authentication/i }));

    expect(await screen.findByAltText(/scan this qr code/i)).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/enter the 6-digit code/i), "654321");
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(screen.getByText(/AAAA111111\s+BBBB222222/)).toBeInTheDocument());
  });

  it("shows an error and stays on setup when the confirm code is wrong", async () => {
    const user = userEvent.setup();
    renderSection({ user: { id: "u1", email: "owner@example.com", totpEnabled: false } });

    await user.click(await screen.findByRole("button", { name: /set up two-factor authentication/i }));
    await user.type(await screen.findByLabelText(/enter the 6-digit code/i), "000000");
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't match/i);
    expect(screen.getByLabelText(/enter the 6-digit code/i)).toBeInTheDocument();
  });

  it("turns off two-factor authentication with a correct code", async () => {
    const user = userEvent.setup();
    renderSection({ user: { id: "u1", email: "owner@example.com", totpEnabled: true } });

    await user.type(await screen.findByLabelText(/enter a code to turn it off/i), "111222");
    await user.click(screen.getByRole("button", { name: /turn off/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /set up two-factor authentication/i })).toBeInTheDocument(),
    );
  });
});
