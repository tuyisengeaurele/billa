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

async function setUpMemberAndDraft(app: ReturnType<typeof createApp>, requireApprovalToFinalize: boolean) {
  const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
  const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
  const businessId = ownerRes.body.business.id as string;

  await request(app).patch("/business").set("Cookie", ownerCookies).send({ requireApprovalToFinalize });

  const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
    app,
    "member@example.com",
    "Member's Own Biz",
  );
  await prisma.businessMember.create({ data: { businessId, userId: memberId } });
  const switchRes = await request(app)
    .post("/auth/switch-business")
    .set("Cookie", memberOwnCookies)
    .send({ businessId });
  const memberCookies = switchRes.headers["set-cookie"] as unknown as string[];

  const customer = await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Acme Ltd" });
  const draft = await request(app)
    .post("/documents")
    .set("Cookie", memberCookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-08-19",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
    });

  return { ownerCookies, memberCookies, documentId: draft.body.document.id as string };
}

describe("POST /documents/:id/finalize with approval required", () => {
  it("blocks a member from finalizing when the business requires approval", async () => {
    const app = createApp();
    const { memberCookies, documentId } = await setUpMemberAndDraft(app, true);

    const res = await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", memberCookies);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("finalize_requires_approval");
  });

  it("still lets the owner finalize when approval is required", async () => {
    const app = createApp();
    const { ownerCookies, documentId } = await setUpMemberAndDraft(app, true);

    const res = await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", ownerCookies);

    expect(res.status).toBe(200);
    expect(res.body.document.status).toBe("FINALIZED");
  });

  it("lets a member finalize when the business does not require approval", async () => {
    const app = createApp();
    const { memberCookies, documentId } = await setUpMemberAndDraft(app, false);

    const res = await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", memberCookies);

    expect(res.status).toBe(200);
    expect(res.body.document.status).toBe("FINALIZED");
  });
});
