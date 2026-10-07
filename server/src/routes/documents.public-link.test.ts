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

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const session = await request(app)
    .post("/auth/session")
    .send({ idToken: JSON.stringify({ uid: email, email }), businessName: `${email} Traders` });
  return session.headers["set-cookie"] as unknown as string[];
}

async function setUp(app: ReturnType<typeof createApp>, finalize = true) {
  const cookies = await signIn(app, "owner@example.com");
  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-10-01",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });
  const id = created.body.document.id as string;
  if (finalize) await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  const document = await prisma.document.findUniqueOrThrow({ where: { id } });
  const owner = await prisma.customer.findUniqueOrThrow({ where: { id: customer.body.customer.id } });
  return { cookies, id, token: document.publicToken, portalToken: owner.portalToken };
}

describe("switching a document's public link off", () => {
  it("makes the public page, the payment request and the customer statement list stop answering", async () => {
    const app = createApp();
    const { cookies, id, token, portalToken } = await setUp(app);
    expect((await request(app).get(`/public/documents/${token}`)).status).toBe(200);
    expect((await request(app).get(`/public/customers/${portalToken}`)).body.documents).toHaveLength(1);

    const off = await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: false });

    expect(off.status).toBe(200);
    expect(off.body.publicLinkDisabledAt).not.toBeNull();
    expect((await request(app).get(`/public/documents/${token}`)).status).toBe(404);
    expect((await request(app).post(`/public/documents/${token}/momo/request`).send({ phoneNumber: "0788123456" })).status).toBe(404);
    expect((await request(app).post(`/public/documents/${token}/decline`)).status).toBe(404);
    expect((await request(app).get(`/public/customers/${portalToken}`)).body.documents).toHaveLength(0);
  });

  it("brings the same link back when it is switched on again", async () => {
    const app = createApp();
    const { cookies, id, token } = await setUp(app);
    await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: false });

    const on = await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: true });

    expect(on.body.publicLinkDisabledAt).toBeNull();
    expect((await request(app).get(`/public/documents/${token}`)).status).toBe(200);
  });

  it("records who turned it off and on in the activity log, once per change", async () => {
    const app = createApp();
    const { cookies, id } = await setUp(app);

    await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: false });
    await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: false });
    await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: true });

    const actions = (await prisma.activityLogEntry.findMany({ orderBy: { createdAt: "asc" } }))
      .map((entry) => entry.action)
      .filter((action) => action.startsWith("DOCUMENT_LINK"));
    expect(actions).toEqual(["DOCUMENT_LINK_DISABLED", "DOCUMENT_LINK_ENABLED"]);
  });

  it("refuses a draft, which has no public page yet", async () => {
    const app = createApp();
    const { cookies, id } = await setUp(app, false);

    const res = await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("not_finalized");
  });

  it("does not let another business switch it", async () => {
    const app = createApp();
    const { id } = await setUp(app);
    const strangerCookies = await signIn(app, "stranger@example.com");

    const res = await request(app)
      .patch(`/documents/${id}/public-link`)
      .set("Cookie", strangerCookies)
      .send({ enabled: false });

    expect(res.status).toBe(404);
  });

  it("shows the state on the document so the app can offer the right button", async () => {
    const app = createApp();
    const { cookies, id } = await setUp(app);
    await request(app).patch(`/documents/${id}/public-link`).set("Cookie", cookies).send({ enabled: false });

    const res = await request(app).get(`/documents/${id}`).set("Cookie", cookies);

    expect(res.body.document.publicLinkDisabledAt).not.toBeNull();
  });
});
