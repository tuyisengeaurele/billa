import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(async () => {
  await resetDb();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createInvoice(app: ReturnType<typeof createApp>, cookies: string[], finalize: boolean) {
  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-08-18",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  const id = created.body.document.id as string;
  if (finalize) await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  return id;
}

describe("POST /documents/:id/shared", () => {
  it("records sentAt and an activity entry for a WhatsApp share", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createInvoice(app, cookies, true);

    const res = await request(app).post(`/documents/${id}/shared`).set("Cookie", cookies).send({ channel: "WHATSAPP" });

    expect(res.status).toBe(200);
    expect(res.body.sentAt).not.toBeNull();
    const entry = await prisma.activityLogEntry.findFirst({ where: { action: "DOCUMENT_SHARED", entityId: id } });
    expect(entry?.metadata).toMatchObject({ channel: "WHATSAPP", type: "INVOICE", number: "INV-0001" });
  });

  it("returns 409 for a draft", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createInvoice(app, cookies, false);

    const res = await request(app).post(`/documents/${id}/shared`).set("Cookie", cookies).send({ channel: "WHATSAPP" });

    expect(res.status).toBe(409);
  });

  it("returns 400 for an unknown channel", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createInvoice(app, cookies, true);

    const res = await request(app).post(`/documents/${id}/shared`).set("Cookie", cookies).send({ channel: "FAX" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for a document in another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/documents/does-not-exist/shared")
      .set("Cookie", cookies)
      .send({ channel: "WHATSAPP" });

    expect(res.status).toBe(404);
  });
});
