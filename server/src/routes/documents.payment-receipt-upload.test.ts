import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
});

beforeEach(resetDb);

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /documents/payments/receipt", () => {
  it("accepts a valid PNG and returns a url", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/documents/payments/receipt")
      .set("Cookie", cookies)
      .attach("receipt", MINIMAL_PNG, "receipt.png");

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\/[\w-]+\.png$/);
  });

  it("rejects a non-image file even with an image extension", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/documents/payments/receipt")
      .set("Cookie", cookies)
      .attach("receipt", Buffer.from("not an image"), "fake.png");

    expect(res.status).toBe(400);
  });

  it("rejects a missing file", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/documents/payments/receipt").set("Cookie", cookies);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/documents/payments/receipt")
      .attach("receipt", MINIMAL_PNG, "receipt.png");
    expect(res.status).toBe(401);
  });
});
