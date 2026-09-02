import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createDocument(app: ReturnType<typeof createApp>, cookies: string[]) {
  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-08-19",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
    });
  return created.body.document as { id: string };
}

describe("PATCH /documents/:id/reminders", () => {
  it("turns reminders off for one document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createDocument(app, cookies);

    const res = await request(app)
      .patch(`/documents/${document.id}/reminders`)
      .set("Cookie", cookies)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.document.remindersEnabled).toBe(false);
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(updated.remindersEnabled).toBe(false);
  });

  it("turns reminders back on", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createDocument(app, cookies);
    await request(app).patch(`/documents/${document.id}/reminders`).set("Cookie", cookies).send({ enabled: false });

    const res = await request(app)
      .patch(`/documents/${document.id}/reminders`)
      .set("Cookie", cookies)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.document.remindersEnabled).toBe(true);
  });

  it("returns 404 for a document belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createDocument(app, cookies);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Biz",
    });

    const res = await request(app)
      .patch(`/documents/${document.id}/reminders`)
      .set("Cookie", otherRes.headers["set-cookie"] as unknown as string[])
      .send({ enabled: false });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-boolean enabled value", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createDocument(app, cookies);

    const res = await request(app)
      .patch(`/documents/${document.id}/reminders`)
      .set("Cookie", cookies)
      .send({ enabled: "false" });

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/documents/some-id/reminders").send({ enabled: false });
    expect(res.status).toBe(401);
  });
});
