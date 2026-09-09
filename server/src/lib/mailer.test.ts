import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";

vi.mock("google-auth-library");

function mockAccessToken(token: string | null | undefined) {
  vi.mocked(OAuth2Client.prototype.setCredentials).mockImplementation(() => {});
  vi.mocked(OAuth2Client.prototype.getAccessToken).mockResolvedValue({ token } as never);
}

describe("mailer", () => {
  beforeEach(async () => {
    await resetDb();
    vi.resetModules();
    vi.mocked(OAuth2Client.prototype.getAccessToken).mockReset();
    process.env.GMAIL_USER = "billarw1@gmail.com";
    process.env.GMAIL_CLIENT_ID = "client-id";
    process.env.GMAIL_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_REFRESH_TOKEN = "refresh-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends a document email with its attachment through the Gmail API", async () => {
    mockAccessToken("access-token-1");
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { sendDocumentEmail } = await import("./mailer.js");
    await sendDocumentEmail({
      to: "customer@example.com",
      subject: "Your invoice",
      html: "<p>hi</p>",
      attachmentFilename: "INV-0001.pdf",
      attachmentBuffer: Buffer.from("pdf-bytes"),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token-1" }),
      }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const decoded = Buffer.from(body.raw, "base64").toString("utf8");
    expect(decoded).toContain("customer@example.com");
    expect(decoded).toContain("Your invoice");
    expect(decoded).toContain("INV-0001.pdf");
    expect(await prisma.emailSendLog.count()).toBe(1);
  });

  it("sends a plain email without an attachment", async () => {
    mockAccessToken("access-token-1");
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { sendEmail } = await import("./mailer.js");
    await sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const decoded = Buffer.from(body.raw, "base64").toString("utf8");
    expect(decoded).toContain("someone@example.com");
    expect(decoded).toContain("Hello");
    expect(await prisma.emailSendLog.count()).toBe(1);
  });

  it("throws when the send fails, instead of swallowing the error", async () => {
    mockAccessToken("access-token-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));

    const { sendEmail } = await import("./mailer.js");

    await expect(sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" })).rejects.toThrow(
      /400/,
    );
    expect(await prisma.emailSendLog.count()).toBe(0);
  });

  it("throws a clear error when Gmail credentials are not configured", async () => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;

    const { sendEmail } = await import("./mailer.js");

    await expect(sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" })).rejects.toThrow(
      /GMAIL_CLIENT_ID|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN/,
    );
  });

  it("reports healthy when an access token comes back", async () => {
    mockAccessToken("access-token-1");

    const { checkMailerHealth } = await import("./mailer.js");

    expect(await checkMailerHealth()).toEqual({ ok: true, error: null });
  });

  it("reports unhealthy when refreshing the access token fails, with the real error message", async () => {
    vi.mocked(OAuth2Client.prototype.setCredentials).mockImplementation(() => {});
    vi.mocked(OAuth2Client.prototype.getAccessToken).mockRejectedValue(new Error("invalid_grant"));

    const { checkMailerHealth } = await import("./mailer.js");

    expect(await checkMailerHealth()).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("reports unhealthy when no access token comes back, without throwing", async () => {
    mockAccessToken(null);

    const { checkMailerHealth } = await import("./mailer.js");

    expect(await checkMailerHealth()).toEqual({ ok: false, error: "Did not receive an access token" });
  });
});
