import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "./prisma.js";
import * as mailerModule from "./mailer.js";
import { sendOwnerPaymentDigestIfDue } from "./owner-digest.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

beforeEach(() => {
  vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
});

async function setup() {
  const app = createApp();
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = res.headers["set-cookie"] as unknown as string[];

  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const customerId = customer.body.customer.id as string;

  const business = await prisma.business.findFirstOrThrow();
  return { app, cookies, businessId: business.id, customerId };
}

describe("sendOwnerPaymentDigestIfDue", () => {
  it("sends a digest and records the send time", async () => {
    const { businessId } = await setup();

    const result = await sendOwnerPaymentDigestIfDue(businessId);

    expect(result.sent).toBe(true);
    expect(mailerModule.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.com" }),
    );

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business.lastDigestSentAt).not.toBeNull();
  });

  it("does not send again within 7 days", async () => {
    const { businessId } = await setup();

    await sendOwnerPaymentDigestIfDue(businessId);
    const result = await sendOwnerPaymentDigestIfDue(businessId);

    expect(result.sent).toBe(false);
    expect(mailerModule.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends again once 7 days have passed", async () => {
    const { businessId } = await setup();
    await prisma.business.update({
      where: { id: businessId },
      data: { lastDigestSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });

    const result = await sendOwnerPaymentDigestIfDue(businessId);

    expect(result.sent).toBe(true);
  });

  it("includes the amount collected in the last 7 days", async () => {
    const { app, cookies, customerId, businessId } = await setup();
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
    await request(app)
      .post(`/documents/${created.body.document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: new Date().toISOString().slice(0, 10) });

    await sendOwnerPaymentDigestIfDue(businessId);

    const [call] = vi.mocked(mailerModule.sendEmail).mock.calls;
    expect(call[0].html).toContain("100,000 RWF");
  });

  it("returns not sent for an unknown business", async () => {
    const result = await sendOwnerPaymentDigestIfDue("nonexistent");
    expect(result.sent).toBe(false);
  });
});
