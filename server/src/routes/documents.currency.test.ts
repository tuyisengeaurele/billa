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

function invoice(customerId: string, extra: Record<string, unknown> = {}) {
  return {
    type: "INVOICE",
    customerId,
    issueDate: "2026-10-01",
    lines: [{ description: "Consulting", quantity: 2, unitPrice: 12550, taxRate: 0 }],
    ...extra,
  };
}

describe("document currency", () => {
  it("saves an invoice in RWF by default, with no rate", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId));

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ currency: "RWF", exchangeRate: null });
  });

  it("saves an invoice in dollars with its rate and totals in cents", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { currency: "USD", exchangeRate: 1450 }));

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ currency: "USD", exchangeRate: 1450, total: 25100 });
  });

  it("refuses a foreign currency without a rate", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId, { currency: "EUR" }));

    expect(res.status).toBe(400);
  });

  it("refuses a currency it does not know", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { currency: "XYZ", exchangeRate: 2 }));

    expect(res.status).toBe(400);
  });

  it("lets a draft change currency, and clears the rate when it goes back to RWF", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { currency: "USD", exchangeRate: 1450 }));

    const back = await request(app)
      .patch(`/documents/${created.body.document.id}`)
      .set("Cookie", cookies)
      .send(invoice(customerId, { currency: "RWF", exchangeRate: 1450 }));

    expect(back.body.document).toMatchObject({ currency: "RWF", exchangeRate: null });
  });

  it("gives a credit note the currency and rate of the invoice it refers to, whatever is sent", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { currency: "USD", exchangeRate: 1450 }));
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
        lines: [{ description: "Returned", quantity: 1, unitPrice: 5000, taxRate: 0 }],
      });

    expect(credit.status).toBe(201);
    expect(credit.body.document).toMatchObject({ currency: "USD", exchangeRate: 1450 });
  });

  it("carries the currency and rate into an invoice converted from a proforma", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send(invoice(customerId, { type: "PROFORMA", currency: "EUR", exchangeRate: 1600 }));
    const id = created.body.document.id as string;
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    const converted = await request(app).post(`/documents/${id}/convert`).set("Cookie", cookies);

    expect(converted.status).toBe(201);
    expect(converted.body.document).toMatchObject({ currency: "EUR", exchangeRate: 1600 });
  });

  it("offers the rate last used for each foreign currency", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId, { currency: "USD", exchangeRate: 1400 }));
    await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId, { currency: "USD", exchangeRate: 1450 }));
    await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId, { currency: "EUR", exchangeRate: 1600 }));
    await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId));

    const res = await request(app).get("/documents/rates").set("Cookie", cookies);

    expect(res.body.rates).toEqual({ USD: 1450, EUR: 1600 });
  });

  it("prefers the bank's reference rate over the one last used, and says where each came from", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId, { currency: "USD", exchangeRate: 1400 }));
    await request(app).post("/documents").set("Cookie", cookies).send(invoice(customerId, { currency: "EUR", exchangeRate: 1600 }));
    await prisma.exchangeRate.create({
      data: { currency: "USD", rate: 1473.79, rateDate: new Date("2026-09-29"), source: "BNR", fetchedAt: new Date() },
    });

    const res = await request(app).get("/documents/rates").set("Cookie", cookies);

    expect(res.body.rates).toEqual({ USD: 1473.79, EUR: 1600 });
    expect(res.body.info).toEqual({
      USD: { source: "BNR", date: "2026-09-29" },
      EUR: { source: "LAST_USED", date: null },
    });
  });
});
