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

async function createDocument(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  type = "INVOICE",
  dueDate?: string,
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate: "2026-08-19",
      ...(dueDate ? { dueDate } : {}),
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

async function finalizeDocument(app: ReturnType<typeof createApp>, cookies: string[], id: string) {
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
}

describe("GET /dashboard/summary", () => {
  it("counts drafts and excludes finalized documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);
    const toFinalize = await createDocument(app, cookies, customerId);
    await finalizeDocument(app, cookies, toFinalize);

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.draftCount).toBe(1);
  });

  it("counts finalized invoices past their due date as overdue, and excludes drafts and future due dates", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const overdueId = await createDocument(app, cookies, customerId, "INVOICE", "2020-01-01");
    await finalizeDocument(app, cookies, overdueId);

    const notYetDueId = await createDocument(app, cookies, customerId, "INVOICE", "2099-01-01");
    await finalizeDocument(app, cookies, notYetDueId);

    await createDocument(app, cookies, customerId, "INVOICE", "2020-01-01");

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.overdueInvoiceCount).toBe(1);
  });

  it("does not count a past-due quote as an overdue invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const quoteId = await createDocument(app, cookies, customerId, "QUOTE", "2020-01-01");
    await finalizeDocument(app, cookies, quoteId);

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.overdueInvoiceCount).toBe(0);
  });

  it("returns the 6 most recently created documents, newest first", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(await createDocument(app, cookies, customerId));
    }

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.recentDocuments).toHaveLength(6);
    expect(res.body.recentDocuments[0].id).toBe(ids[7]);
    expect(res.body.recentDocuments[0].customerName).toBe("Musanze Supplies");
  });

  it("does not include another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/dashboard/summary").set("Cookie", otherCookies);

    expect(res.body.draftCount).toBe(0);
    expect(res.body.recentDocuments).toHaveLength(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("counts documents created this month separately from last month", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    await createDocument(app, cookies, customerId);
    const lastMonthId = await createDocument(app, cookies, customerId);
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await prisma.document.update({ where: { id: lastMonthId }, data: { createdAt: lastMonth } });

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.documentsThisMonth).toBe(1);
    expect(res.body.documentsLastMonth).toBe(1);
  });

  it("returns all document types in documentsByType, even at zero", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.documentsByType).toHaveLength(6);
    const invoiceRow = res.body.documentsByType.find((row: { type: string }) => row.type === "INVOICE");
    const quoteRow = res.body.documentsByType.find((row: { type: string }) => row.type === "QUOTE");
    expect(invoiceRow.count).toBe(1);
    expect(quoteRow.count).toBe(0);
  });

  it("reports customerCount and hasLogo for the onboarding checklist", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies);
    const secondCustomerId = await createCustomer(app, cookies);

    const before = await request(app).get("/dashboard/summary").set("Cookie", cookies);
    expect(before.body.customerCount).toBe(2);
    expect(before.body.hasLogo).toBe(false);

    const secondCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: secondCustomerId } });
    await prisma.business.update({
      where: { id: secondCustomer.businessId },
      data: { logoUrl: "/uploads/biz1/logo.png" },
    });

    const after = await request(app).get("/dashboard/summary").set("Cookie", cookies);
    expect(after.body.hasLogo).toBe(true);
  });

  it("returns 14 days of activity, including zero-count days", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.activityByDay).toHaveLength(14);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = res.body.activityByDay.find((row: { date: string }) => row.date === today);
    expect(todayRow.count).toBe(1);
  });
});
