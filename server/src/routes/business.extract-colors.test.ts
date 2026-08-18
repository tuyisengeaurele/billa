import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "Supersecret1!",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function uploadTwoToneLogo(app: ReturnType<typeof createApp>, cookies: string[]) {
  const square = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 230, g: 60, b: 40, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const buffer = await sharp({
    create: { width: 50, height: 50, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 1 } },
  })
    .composite([{ input: square, left: 15, top: 15 }])
    .png()
    .toBuffer();

  const res = await request(app).post("/business/logo").set("Cookie", cookies).attach("logo", buffer, "logo.png");
  return res.body.url as string;
}

describe("POST /business/logo/extract-colors", () => {
  it("returns a primary color and accents for an uploaded logo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadTwoToneLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/extract-colors")
      .set("Cookie", cookies)
      .send({ url });

    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toMatch(/^#[0-9A-F]{6}$/);
    expect(Array.isArray(res.body.accentColors)).toBe(true);
    expect(res.body.contrastRatio).toBeGreaterThanOrEqual(3);
  });

  it("rejects a url belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await uploadTwoToneLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/extract-colors")
      .set("Cookie", cookies)
      .send({ url: "/uploads/some-other-business/file.png" });

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/business/logo/extract-colors")
      .send({ url: "/uploads/x/y.png" });
    expect(res.status).toBe(401);
  });
});
