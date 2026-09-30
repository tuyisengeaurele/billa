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

// The smallest valid PNG, so the file sniffer accepts it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

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
      issueDate: "2026-10-01",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });
  return { cookies, documentId: created.body.document.id as string };
}

describe("document attachments", () => {
  it("keeps an image and a PDF with a document and lists them with it", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);

    const image = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PNG, "po-scan.png");
    const pdf = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PDF, "contract.pdf");

    expect(image.status).toBe(201);
    expect(image.body.attachment).toMatchObject({ fileName: "po-scan.png", contentType: "image/png" });
    expect(pdf.status).toBe(201);
    expect(pdf.body.attachment).toMatchObject({ fileName: "contract.pdf", contentType: "application/pdf" });

    const res = await request(app).get(`/documents/${documentId}`).set("Cookie", cookies);
    expect(res.body.document.attachments.map((a: { fileName: string }) => a.fileName)).toEqual([
      "po-scan.png",
      "contract.pdf",
    ]);
  });

  it("refuses a file that is neither an image nor a PDF, whatever its name says", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);

    const res = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", Buffer.from("<script>alert(1)</script>"), "notes.pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_file_type");
    expect(await prisma.documentAttachment.count()).toBe(0);
  });

  it("stops at five attachments", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post(`/documents/${documentId}/attachments`)
        .set("Cookie", cookies)
        .attach("file", PNG, `scan-${i}.png`);
    }

    const sixth = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PNG, "scan-6.png");

    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toBe("too_many_attachments");
  });

  it("lets files be added and removed after the document is finalized", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);
    await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", cookies);

    const added = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PDF, "proof.pdf");
    const removed = await request(app)
      .delete(`/documents/${documentId}/attachments/${added.body.attachment.id}`)
      .set("Cookie", cookies);

    expect(added.status).toBe(201);
    expect(removed.status).toBe(204);
    expect(await prisma.documentAttachment.count()).toBe(0);
  });

  it("keeps only the file name, not a path, and does not touch another business's documents", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);
    const other = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = other.headers["set-cookie"] as unknown as string[];

    const named = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PNG, "C:\\Users\\me\\Desktop\\scan.png");
    const foreign = await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", otherCookies)
      .attach("file", PNG, "scan.png");

    expect(named.body.attachment.fileName).toBe("scan.png");
    expect(foreign.status).toBe(404);
  });

  it("removes the attachments together with a draft", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);
    await request(app)
      .post(`/documents/${documentId}/attachments`)
      .set("Cookie", cookies)
      .attach("file", PNG, "scan.png");

    const res = await request(app).delete(`/documents/${documentId}`).set("Cookie", cookies);

    expect(res.status).toBe(204);
    expect(await prisma.documentAttachment.count()).toBe(0);
  });
});
