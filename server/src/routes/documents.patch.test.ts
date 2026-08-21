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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createDraft(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

describe("PATCH /documents/:id", () => {
  it("replaces the header and line items, recomputing totals", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const res = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-20",
        lines: [
          { description: "Printing", quantity: 3, unitPrice: 5000, taxRate: 18 },
          { description: "Delivery", quantity: 1, unitPrice: 2000, taxRate: 0 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.document.lines).toHaveLength(2);
    expect(res.body.document.subtotal).toBe(17000);
    expect(res.body.document.total).toBe(19700);
  });

  it("rejects updates to a finalized document with 409", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);
    await prisma.document.update({ where: { id }, data: { status: "FINALIZED", number: "INV-0001" } });

    const res = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    expect(res.status).toBe(409);
  });

  it("returns 404 for a document belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", otherCookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .patch("/documents/x")
      .send({ type: "INVOICE", customerId: "x", issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(401);
  });
});
