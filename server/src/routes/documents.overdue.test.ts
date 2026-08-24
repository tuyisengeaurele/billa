import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "../lib/pdf/render-document-pdf.js";
import * as resendModule from "../lib/resend.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);
beforeEach(() => {
  vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  vi.spyOn(resendModule, "sendDocumentEmail").mockResolvedValue();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app)
    .post("/customers")
    .set("Cookie", cookies)
    .send({ name: "Musanze Supplies", email: "musanze@example.com" });
  return res.body.customer.id as string;
}

describe("POST /documents/overdue/send-reminders", () => {
  it("sends reminders for the caller's overdue invoices", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2020-01-01",
        dueDate: "2020-01-15",
        lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).post("/documents/overdue/send-reminders").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.sent).toHaveLength(1);
    expect(res.body.sent[0].sentTo).toBe("musanze@example.com");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/overdue/send-reminders");
    expect(res.status).toBe(401);
  });
});
