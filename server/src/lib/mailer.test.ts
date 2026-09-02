import { beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";

vi.mock("nodemailer");

describe("mailer", () => {
  beforeEach(async () => {
    await resetDb();
    vi.resetModules();
    vi.mocked(nodemailer.createTransport).mockReset();
    process.env.GMAIL_USER = "billarw1@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "orzj toey ucfg glge";
  });

  it("sends a document email with its attachment through Gmail SMTP", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, verify: vi.fn() } as never);

    const { sendDocumentEmail } = await import("./mailer.js");
    await sendDocumentEmail({
      to: "customer@example.com",
      subject: "Your invoice",
      html: "<p>hi</p>",
      attachmentFilename: "INV-0001.pdf",
      attachmentBuffer: Buffer.from("pdf-bytes"),
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "billarw1@gmail.com", pass: "orzjtoeyucfgglge" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining("billarw1@gmail.com"),
        to: "customer@example.com",
        subject: "Your invoice",
        html: "<p>hi</p>",
        attachments: [{ filename: "INV-0001.pdf", content: Buffer.from("pdf-bytes") }],
      }),
    );
    expect(await prisma.emailSendLog.count()).toBe(1);
  });

  it("sends a plain email without an attachment", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, verify: vi.fn() } as never);

    const { sendEmail } = await import("./mailer.js");
    await sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" }),
    );
    expect(await prisma.emailSendLog.count()).toBe(1);
  });

  it("throws when the send fails, instead of swallowing the error", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("invalid credentials"));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, verify: vi.fn() } as never);

    const { sendEmail } = await import("./mailer.js");

    await expect(sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" })).rejects.toThrow(
      "invalid credentials",
    );
    expect(await prisma.emailSendLog.count()).toBe(0);
  });

  it("throws a clear error when Gmail credentials are not configured", async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;

    const { sendEmail } = await import("./mailer.js");

    await expect(sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>hi</p>" })).rejects.toThrow(
      /GMAIL_USER|GMAIL_APP_PASSWORD/,
    );
  });

  it("reports healthy when the transport verifies", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn(), verify } as never);

    const { checkMailerHealth } = await import("./mailer.js");

    expect(await checkMailerHealth()).toBe(true);
  });

  it("reports unhealthy when the transport fails to verify", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("auth failed"));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn(), verify } as never);

    const { checkMailerHealth } = await import("./mailer.js");

    expect(await checkMailerHealth()).toBe(false);
  });
});
