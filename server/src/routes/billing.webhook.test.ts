import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

vi.mock("../lib/flutterwave.js", () => ({
  initiateCheckout: vi.fn(),
  verifyTransaction: vi.fn(),
}));

import { verifyTransaction } from "../lib/flutterwave.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.FLUTTERWAVE_WEBHOOK_HASH ??= "test-webhook-hash";
});

beforeEach(resetDb);

describe("POST /billing/webhook", () => {
  it("rejects a request with the wrong verif-hash", async () => {
    const res = await request(createApp())
      .post("/billing/webhook")
      .set("verif-hash", "wrong-hash")
      .send({ data: { tx_ref: "x", id: 1 } });

    expect(res.status).toBe(401);
  });

  it("extends the business's period on a genuine webhook", async () => {
    const app = createApp();
    const registerRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
    const userId = registerRes.body.user.id as string;
    const payment = await prisma.payment.create({
      data: {
        userId,
        plan: "MONTHLY",
        amount: 6500,
        currency: "RWF",
        txRef: "billa-test-webhook",
        status: "PENDING",
      },
    });

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    const res = await request(app)
      .post("/billing/webhook")
      .set("verif-hash", "test-webhook-hash")
      .send({ data: { tx_ref: payment.txRef, id: 999 } });

    expect(res.status).toBe(200);
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { txRef: payment.txRef } });
    expect(updatedPayment.status).toBe("SUCCESSFUL");
  });
});
