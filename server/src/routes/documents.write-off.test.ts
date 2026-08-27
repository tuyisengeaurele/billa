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

async function createFinalizedInvoice(app: ReturnType<typeof createApp>, cookies: string[]) {
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
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document as { id: string };
}

describe("POST /documents/:id/write-off", () => {
  it("marks an unpaid invoice as written off", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const invoice = await createFinalizedInvoice(app, cookies);

    const res = await request(app)
      .post(`/documents/${invoice.id}/write-off`)
      .set("Cookie", cookies)
      .send({ writeOffReason: "Customer unreachable" });

    expect(res.status).toBe(200);
    expect(res.body.document.paymentStatus).toBe("WRITTEN_OFF");
  });

  it("rejects writing off an already-paid invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const invoice = await createFinalizedInvoice(app, cookies);
    await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: "2026-08-20" });

    const res = await request(app)
      .post(`/documents/${invoice.id}/write-off`)
      .set("Cookie", cookies)
      .send({ writeOffReason: "Customer unreachable" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_paid");
  });

  it("requires a reason", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const invoice = await createFinalizedInvoice(app, cookies);

    const res = await request(app).post(`/documents/${invoice.id}/write-off`).set("Cookie", cookies).send({});

    expect(res.status).toBe(400);
  });
});

describe("POST /documents/:id/reactivate", () => {
  it("restores a written-off invoice to its real payment status", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const invoice = await createFinalizedInvoice(app, cookies);
    await request(app)
      .post(`/documents/${invoice.id}/write-off`)
      .set("Cookie", cookies)
      .send({ writeOffReason: "Customer unreachable" });

    const res = await request(app).post(`/documents/${invoice.id}/reactivate`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.document.paymentStatus).toBe("UNPAID");
    expect(res.body.document.writtenOffAt).toBeNull();
  });

  it("returns 409 for an invoice that isn't written off", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const invoice = await createFinalizedInvoice(app, cookies);

    const res = await request(app).post(`/documents/${invoice.id}/reactivate`).set("Cookie", cookies);

    expect(res.status).toBe(409);
  });
});
