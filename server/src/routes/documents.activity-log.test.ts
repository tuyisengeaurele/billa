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
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    businessId: res.body.business.id as string,
  };
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return res.body.customer.id as string;
}

describe("document routes log activity", () => {
  it("logs DOCUMENT_CREATED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    await request(app).post("/documents").set("Cookie", cookies).send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-25",
      lines: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 18 }],
    });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "DOCUMENT_CREATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ type: "INVOICE" });
  });

  it("logs DOCUMENT_FINALIZED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const createRes = await request(app).post("/documents").set("Cookie", cookies).send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-25",
      lines: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 18 }],
    });

    await request(app).post(`/documents/${createRes.body.document.id}/finalize`).set("Cookie", cookies);

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "DOCUMENT_FINALIZED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ type: "INVOICE" });
  });

  it("logs DOCUMENT_DELETED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const createRes = await request(app).post("/documents").set("Cookie", cookies).send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-25",
      lines: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 18 }],
    });

    await request(app).delete(`/documents/${createRes.body.document.id}`).set("Cookie", cookies);

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "DOCUMENT_DELETED" } });
    expect(rows).toHaveLength(1);
  });
});
