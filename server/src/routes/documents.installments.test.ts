import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function setUp(app: ReturnType<typeof createApp>) {
  const session = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = session.headers["set-cookie"] as unknown as string[];
  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return { cookies, customerId: customer.body.customer.id as string };
}

const PLAN = [
  { label: "Deposit", amount: 40000, dueDate: "2026-10-01" },
  { label: "Balance", amount: 60000, dueDate: "2026-11-15" },
];

function invoice(customerId: string, extra: Record<string, unknown> = {}) {
  return {
    type: "INVOICE",
    customerId,
    issueDate: "2026-10-01",
    lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
    ...extra,
  };
}

describe("invoice payment plans", () => {
  it("saves the instalments with a new invoice and returns them in date order", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: [PLAN[1], PLAN[0]] }));

    expect(res.status).toBe(201);
    expect(res.body.document.installments.map((step: { label: string }) => step.label)).toEqual(["Deposit", "Balance"]);
    expect(res.body.document.installments[0]).toMatchObject({ amount: 40000, sortOrder: 0 });
    expect(res.body.document.installments[1]).toMatchObject({ amount: 60000, sortOrder: 1 });
  });

  it("sets the invoice's due date to the last instalment", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { dueDate: "2026-10-05", installments: PLAN }));

    expect(res.body.document.dueDate.slice(0, 10)).toBe("2026-11-15");
  });

  it("works out the total from the lines and refuses a plan that does not add up to it", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: [{ ...PLAN[0], amount: 30000 }, PLAN[1]] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_installments");
    expect(res.body.message).toBe("The instalments add up to 90,000 RWF but the total is 100,000 RWF.");
    expect(await prisma.document.count()).toBe(0);
  });

  it("counts tax and discounts in the total the plan must match", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const lines = [
      { description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 18, discountType: "PERCENT", discountValue: 10 },
    ];

    const ok = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { lines, installments: [{ amount: 50000, dueDate: "2026-10-01" }, { amount: 56200, dueDate: "2026-11-01" }] }));
    const wrong = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { lines, installments: [{ amount: 50000, dueDate: "2026-10-01" }, { amount: 50000, dueDate: "2026-11-01" }] }));

    expect(ok.status).toBe(201);
    expect(wrong.status).toBe(400);
  });

  it("refuses a plan on a quote or with a repeating invoice", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const quote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { type: "QUOTE", installments: PLAN }));
    const repeating = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { recurrence: { interval: "MONTHLY" }, installments: PLAN }));

    expect(quote.status).toBe(400);
    expect(repeating.status).toBe(400);
  });

  it("replaces the plan when a draft is edited, and clears it when the edit has none", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: PLAN }));
    const id = created.body.document.id as string;

    const changed = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: [{ amount: 100000, dueDate: "2026-10-10" }, { amount: 0, dueDate: "2026-10-11" }] }));
    const replaced = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: [{ amount: 25000, dueDate: "2026-10-10" }, { amount: 75000, dueDate: "2026-12-01" }] }));
    const cleared = await request(app).patch(`/documents/${id}`).set("Cookie", cookies).send(invoice(customerId));

    expect(changed.status).toBe(400);
    expect(replaced.body.document.installments.map((step: { amount: number }) => step.amount)).toEqual([25000, 75000]);
    expect(cleared.body.document.installments).toEqual([]);
    expect(await prisma.documentInstalment.count()).toBe(0);
  });

  it("re-checks the plan when the lines of a draft change", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: PLAN }));

    const res = await request(app)
      .patch(`/documents/${created.body.document.id}`)
      .set("Cookie", cookies)
      .send(invoice(customerId, { lines: [{ description: "Cement", quantity: 2, unitPrice: 100000, taxRate: 0 }], installments: PLAN }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/total is 200,000 RWF/);
  });

  it("deletes the plan together with a draft", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: PLAN }));

    const res = await request(app).delete(`/documents/${created.body.document.id}`).set("Cookie", cookies);

    expect(res.status).toBe(204);
    expect(await prisma.documentInstalment.count()).toBe(0);
  });

  it("keeps the plan through finalizing", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: PLAN }));

    const res = await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.document.installments).toHaveLength(2);
  });
});

describe("reading a payment plan back", () => {
  it("shows how much of each instalment has been paid, and which one is next", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: PLAN }));
    const id = created.body.document.id as string;
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    await request(app)
      .post(`/documents/${id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 50000, method: "CASH", paidOn: "2026-10-02" });

    const res = await request(app).get(`/documents/${id}`).set("Cookie", cookies);

    expect(res.body.document.schedule.map((step: { paid: number; remaining: number; status: string }) => [step.paid, step.remaining, step.status])).toEqual([
      [40000, 0, "PAID"],
      [10000, 50000, "PARTIALLY_PAID"],
    ]);
    expect(res.body.document.nextInstallment).toMatchObject({ label: "Balance", remaining: 50000, dueDate: "2026-11-15" });
  });

  it("gives an invoice without a plan no schedule", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId));

    const res = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies);

    expect(res.body.document.schedule).toBeNull();
    expect(res.body.document.nextInstallment).toBeNull();
  });

  it("counts a credit note as covering the plan, like a payment", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { installments: PLAN }));
    const id = created.body.document.id as string;
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    const credit = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "CREDIT_NOTE",
        customerId,
        issueDate: "2026-10-03",
        referencedDocumentId: id,
        lines: [{ description: "Returned", quantity: 1, unitPrice: 40000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${credit.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).get(`/documents/${id}`).set("Cookie", cookies);

    expect(res.body.document.schedule[0]).toMatchObject({ paid: 40000, status: "PAID" });
  });
});
