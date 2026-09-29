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
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-08-24",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  const document = (await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies)).body
    .document as { id: string; publicToken: string };
  return { cookies, document, ownerId: session.body.user.id as string };
}

const BROWSER = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

describe("public document views", () => {
  it("counts a customer opening the page and stamps the first and last view", async () => {
    const app = createApp();
    const { document } = await setUp(app);

    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", BROWSER);
    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", BROWSER);

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.viewCount).toBe(2);
    expect(stored.firstViewedAt).not.toBeNull();
    expect(stored.lastViewedAt!.getTime()).toBeGreaterThanOrEqual(stored.firstViewedAt!.getTime());
  });

  it("tells the owner once, on the first view only", async () => {
    const app = createApp();
    const { document, ownerId } = await setUp(app);

    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", BROWSER);
    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", BROWSER);

    const notifications = await prisma.notification.findMany({ where: { userId: ownerId, type: "DOCUMENT_VIEWED" } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.link).toBe(`/documents/${document.id}`);
  });

  it("ignores link-preview and crawler fetches", async () => {
    const app = createApp();
    const { document } = await setUp(app);

    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", "WhatsApp/2.23.20 A");
    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", "facebookexternalhit/1.1");
    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", "Googlebot/2.1");

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.viewCount).toBe(0);
  });

  it("ignores a signed-in user opening their own link", async () => {
    const app = createApp();
    const { document, cookies } = await setUp(app);

    await request(app).get(`/public/documents/${document.publicToken}`).set("Cookie", cookies).set("User-Agent", BROWSER);

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.viewCount).toBe(0);
  });

  it("does not count a request for a document that does not exist", async () => {
    const app = createApp();
    await setUp(app);

    const res = await request(app).get("/public/documents/nope").set("User-Agent", BROWSER);

    expect(res.status).toBe(404);
  });

  it("exposes the view stamps to the owner", async () => {
    const app = createApp();
    const { document, cookies } = await setUp(app);
    await request(app).get(`/public/documents/${document.publicToken}`).set("User-Agent", BROWSER);

    const res = await request(app).get(`/documents/${document.id}`).set("Cookie", cookies);

    expect(res.body.document.viewCount).toBe(1);
    expect(res.body.document.lastViewedAt).not.toBeNull();
  });
});
