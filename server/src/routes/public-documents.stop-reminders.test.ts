import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "../lib/pdf/render-document-pdf.js";
import * as mailerModule from "../lib/mailer.js";
import { sendOverdueReminders } from "../lib/overdue-reminders.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function finalizedInvoice(app: ReturnType<typeof createApp>) {
  const session = await request(app)
    .post("/auth/session")
    .send({ idToken: JSON.stringify({ uid: "o@example.com", email: "o@example.com" }), businessName: "Kigali Traders" });
  const cookies = session.headers["set-cookie"] as unknown as string[];
  const customer = await request(app)
    .post("/customers")
    .set("Cookie", cookies)
    .send({ name: "Acme Ltd", email: "acme@example.com" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2020-01-01",
      dueDate: "2020-01-31",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });
  const id = created.body.document.id as string;
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  const document = await prisma.document.findUniqueOrThrow({ where: { id } });
  return { id, token: document.publicToken, businessId: document.businessId };
}

describe("POST /public/documents/:token/stop-reminders", () => {
  it("switches reminders off for that one document and nothing else", async () => {
    const app = createApp();
    const { id, token } = await finalizedInvoice(app);

    const res = await request(app).post(`/public/documents/${token}/stop-reminders`);

    expect(res.status).toBe(200);
    const document = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(document.remindersEnabled).toBe(false);
    expect(document.status).toBe("FINALIZED");
  });

  it("answers an unknown or switched-off link with 404 and changes nothing", async () => {
    const app = createApp();
    const { id, token } = await finalizedInvoice(app);

    expect((await request(app).post("/public/documents/not-a-token/stop-reminders")).status).toBe(404);

    await prisma.document.update({ where: { id }, data: { publicLinkDisabledAt: new Date() } });
    expect((await request(app).post(`/public/documents/${token}/stop-reminders`)).status).toBe(404);
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).remindersEnabled).toBe(true);
  });

  it("stops the overdue reminders that would otherwise go out", async () => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
    const send = vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
    const app = createApp();
    const { token, businessId } = await finalizedInvoice(app);

    await request(app).post(`/public/documents/${token}/stop-reminders`);
    const sent = await sendOverdueReminders(businessId);

    expect(sent).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("is what the link in a reminder email leads to", async () => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
    const send = vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
    const app = createApp();
    const { token, businessId } = await finalizedInvoice(app);

    await sendOverdueReminders(businessId);

    const html = send.mock.calls[0]![0].html;
    expect(html).toContain(`/view/${token}?stop=1`);
    expect(html).toContain("Stop reminders for this document");
  });
});
