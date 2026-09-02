import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "../lib/pdf/render-document-pdf.js";
import * as mailerModule from "../lib/mailer.js";

const { captureExceptionMock } = vi.hoisted(() => ({ captureExceptionMock: vi.fn() }));
vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>();
  return { ...actual, captureException: captureExceptionMock };
});

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(async () => {
  await resetDb();
  captureExceptionMock.mockClear();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], email?: string) {
  const res = await request(app)
    .post("/customers")
    .set("Cookie", cookies)
    .send({ name: "Acme Ltd", ...(email ? { email } : {}) });
  return res.body.customer.id as string;
}

async function createFinalizedInvoice(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-18",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document.id as string;
}

describe("POST /documents/:id/send", () => {
  beforeEach(() => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  });

  it("emails the document and records sentAt", async () => {
    const sendSpy = vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.sentAt).not.toBeNull();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "acme@example.com", attachmentFilename: "INV-0001.pdf" }),
    );
  });

  it("returns 409 when the document is still a draft", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-18", lines: [] });

    const res = await request(app).post(`/documents/${created.body.document.id}/send`).set("Cookie", cookies);

    expect(res.status).toBe(409);
  });

  it("returns 400 when the customer has no email on file", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("customer_has_no_email");
  });

  it("returns 502 and does not set sentAt when the email provider fails", async () => {
    vi.spyOn(mailerModule, "sendDocumentEmail").mockRejectedValue(new Error("provider down"));
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(res.status).toBe(502);

    const getRes = await request(app).get(`/documents/${documentId}`).set("Cookie", cookies);
    expect(getRes.body.document.sentAt).toBeNull();
  });

  it("reports the real provider error to Sentry instead of swallowing it silently", async () => {
    const providerError = new Error("You can only send testing emails to your own email address");
    vi.spyOn(mailerModule, "sendDocumentEmail").mockRejectedValue(providerError);
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(captureExceptionMock).toHaveBeenCalledWith(providerError);
  });

  it("sends and saves the requested language when one is given", async () => {
    const sendSpy = vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${documentId}/send`)
      .set("Cookie", cookies)
      .send({ language: "FR" });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("de Kigali") }));
    const getRes = await request(app).get(`/documents/${documentId}`).set("Cookie", cookies);
    expect(getRes.body.document.language).toBe("FR");
  });

  it("returns 400 for an invalid language", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${documentId}/send`)
      .set("Cookie", cookies)
      .send({ language: "DE" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for a document belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Biz",
    });

    const res = await request(app)
      .post(`/documents/${documentId}/send`)
      .set("Cookie", otherRes.headers["set-cookie"] as unknown as string[]);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/some-id/send");
    expect(res.status).toBe(401);
  });
});
