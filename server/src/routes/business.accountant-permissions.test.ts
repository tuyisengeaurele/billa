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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, businessName: string) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName,
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

async function setUpAccountant(app: ReturnType<typeof createApp>) {
  const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
  const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
  const businessId = ownerRes.body.business.id as string;
  const { cookies: accountantOwnCookies, userId: accountantId } = await registerAndGetCookies(
    app,
    "accountant@example.com",
    "Accountant's Own Biz",
  );
  await prisma.businessMember.create({ data: { businessId, userId: accountantId, role: "ACCOUNTANT" } });

  const switchRes = await request(app)
    .post("/auth/switch-business")
    .set("Cookie", accountantOwnCookies)
    .send({ businessId });
  return { accountantCookies: switchRes.headers["set-cookie"] as unknown as string[], businessId, ownerCookies };
}

describe("an accountant is blocked from every business-data mutation", () => {
  it("blocks creating a customer", async () => {
    const app = createApp();
    const { accountantCookies } = await setUpAccountant(app);

    const res = await request(app).post("/customers").set("Cookie", accountantCookies).send({ name: "Acme Ltd" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("read_only_role");
  });

  it("blocks editing a customer", async () => {
    const app = createApp();
    const { accountantCookies, ownerCookies } = await setUpAccountant(app);
    const created = await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Acme Ltd" });

    const res = await request(app)
      .patch(`/customers/${created.body.customer.id}`)
      .set("Cookie", accountantCookies)
      .send({ name: "Renamed" });

    expect(res.status).toBe(403);
  });

  it("blocks creating an item", async () => {
    const app = createApp();
    const { accountantCookies } = await setUpAccountant(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", accountantCookies)
      .send({ description: "Cement bag", unitPrice: 5000, unit: "bag" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("read_only_role");
  });

  it("blocks creating a document", async () => {
    const app = createApp();
    const { accountantCookies, ownerCookies } = await setUpAccountant(app);
    const customer = await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Acme Ltd" });

    const res = await request(app)
      .post("/documents")
      .set("Cookie", accountantCookies)
      .send({ type: "INVOICE", customerId: customer.body.customer.id, issueDate: "2026-08-19", lines: [] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("read_only_role");
  });

  it("blocks recording a payment", async () => {
    const app = createApp();
    const { accountantCookies, ownerCookies } = await setUpAccountant(app);
    const customer = await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Acme Ltd" });
    const created = await request(app)
      .post("/documents")
      .set("Cookie", ownerCookies)
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", ownerCookies);

    const res = await request(app)
      .post(`/documents/${created.body.document.id}/payments`)
      .set("Cookie", accountantCookies)
      .send({ amount: 40000, method: "CASH", paidOn: "2026-08-20" });

    expect(res.status).toBe(403);
  });

  it("still allows reading customers, items, and documents", async () => {
    const app = createApp();
    const { accountantCookies, ownerCookies } = await setUpAccountant(app);
    await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Acme Ltd" });

    const customers = await request(app).get("/customers").set("Cookie", accountantCookies);
    const items = await request(app).get("/items").set("Cookie", accountantCookies);
    const documents = await request(app).get("/documents").set("Cookie", accountantCookies);

    expect(customers.status).toBe(200);
    expect(customers.body.results).toHaveLength(1);
    expect(items.status).toBe(200);
    expect(documents.status).toBe(200);
  });
});
