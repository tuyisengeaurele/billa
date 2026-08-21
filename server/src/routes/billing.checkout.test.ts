import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

vi.mock("../lib/flutterwave.js", () => ({
  initiateCheckout: vi.fn(),
  verifyTransaction: vi.fn(),
}));

import { initiateCheckout } from "../lib/flutterwave.js";

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

describe("POST /billing/checkout", () => {
  it("creates a pending payment and returns a checkout link", async () => {
    vi.mocked(initiateCheckout).mockResolvedValue({ link: "https://checkout.flutterwave.com/pay/abc" });

    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/billing/checkout").set("Cookie", cookies).send({ plan: "MONTHLY" });

    expect(res.status).toBe(200);
    expect(res.body.link).toBe("https://checkout.flutterwave.com/pay/abc");

    const payments = await prisma.payment.findMany();
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("PENDING");
    expect(payments[0].amount).toBe(6500);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/billing/checkout").send({ plan: "MONTHLY" });
    expect(res.status).toBe(401);
  });
});
