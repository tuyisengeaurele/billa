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

describe("POST /documents/recurring/generate-due", () => {
  it("generates a document from a due recurring template scoped to the caller's business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [{ description: "Retainer", quantity: 1, unitPrice: 20000, taxRate: 18 }],
        recurrence: { interval: "MONTHLY" },
      });

    await prisma.document.update({
      where: { id: created.body.document.id },
      data: { nextRecurrenceAt: new Date("2020-01-01") },
    });

    const res = await request(app).post("/documents/recurring/generate-due").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.generated).toHaveLength(1);
    expect(res.body.generated[0].status).toBe("DRAFT");
    expect(res.body.generated[0].total).toBe(23600);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/recurring/generate-due");
    expect(res.status).toBe(401);
  });
});
