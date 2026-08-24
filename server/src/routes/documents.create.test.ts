import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
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

describe("POST /documents", () => {
  it("creates a draft document with computed totals", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [
          { description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 },
          { description: "Delivery", quantity: 1, unitPrice: 1000, taxRate: 0 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe("DRAFT");
    expect(res.body.document.number).toBeNull();
    expect(res.body.document.subtotal).toBe(11000);
    expect(res.body.document.taxTotal).toBe(1800);
    expect(res.body.document.total).toBe(12800);
    expect(res.body.document.lines).toHaveLength(2);
  });

  it("allows creating a draft with zero lines", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    expect(res.status).toBe(201);
    expect(res.body.document.total).toBe(0);
  });

  it("schedules the next occurrence when recurrence is set", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [],
        recurrence: { interval: "MONTHLY" },
      });

    expect(res.status).toBe(201);
    expect(res.body.document.recurrenceInterval).toBe("MONTHLY");
    expect(res.body.document.nextRecurrenceAt.slice(0, 10)).toBe("2026-09-19");
  });

  it("leaves recurrence fields null when recurrence is not set", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    expect(res.body.document.recurrenceInterval).toBeNull();
    expect(res.body.document.nextRecurrenceAt).toBeNull();
  });

  it("rejects a missing customerId with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/documents")
      .send({ type: "INVOICE", customerId: "x", issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(401);
  });
});
