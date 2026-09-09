import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => {
  vi.restoreAllMocks();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
  return res.headers["set-cookie"] as unknown as string[];
}

async function uploadLogo(app: ReturnType<typeof createApp>, cookies: string[], alpha: number) {
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 200, g: 200, b: 200, alpha } },
  })
    .png()
    .toBuffer();

  const res = await request(app).post("/business/logo").set("Cookie", cookies).attach("logo", buffer, "logo.png");
  return res.body.url as string;
}

// A flat single-color square (what uploadLogo above builds) has no foreground for
// the flood fill to find, so it can't demonstrate actual removal - this instead
// gives it a white background with a red mark in the middle, like a real logo.
async function uploadTwoToneLogo(app: ReturnType<typeof createApp>, cookies: string[]) {
  const raw = Buffer.alloc(10 * 10 * 4);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const idx = (y * 10 + x) * 4;
      const isMark = x >= 3 && x < 7 && y >= 3 && y < 7;
      raw[idx] = isMark ? 220 : 255;
      raw[idx + 1] = isMark ? 30 : 255;
      raw[idx + 2] = isMark ? 30 : 255;
      raw[idx + 3] = 255;
    }
  }
  const buffer = await sharp(raw, { raw: { width: 10, height: 10, channels: 4 } }).png().toBuffer();

  const res = await request(app).post("/business/logo").set("Cookie", cookies).attach("logo", buffer, "logo.png");
  return res.body.url as string;
}

describe("POST /business/logo/remove-background", () => {
  it("passes through an already-transparent logo without processing it", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies, 0);

    const res = await request(app).post("/business/logo/remove-background").set("Cookie", cookies).send({ url });

    expect(res.status).toBe(200);
    expect(res.body.backgroundRemoved).toBe(false);
    expect(res.body.url).toBe(url);
  });

  it("removes the background from an opaque logo entirely in-process, no external service involved", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadTwoToneLogo(app, cookies);

    const res = await request(app).post("/business/logo/remove-background").set("Cookie", cookies).send({ url });

    expect(res.status).toBe(200);
    expect(res.body.backgroundRemoved).toBe(true);
    expect(res.body.url).not.toBe(url);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\/[\w-]+\.png$/);
  });

  it("falls back to the original logo instead of erasing it when there's no clear background to isolate", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies, 1);

    const res = await request(app).post("/business/logo/remove-background").set("Cookie", cookies).send({ url });

    expect(res.status).toBe(200);
    expect(res.body.backgroundRemoved).toBe(false);
    expect(res.body.url).toBe(url);
  });

  it("rejects a url belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await uploadLogo(app, cookies, 1);

    const res = await request(app)
      .post("/business/logo/remove-background")
      .set("Cookie", cookies)
      .send({ url: "/uploads/some-other-business/file.png" });

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/business/logo/remove-background")
      .send({ url: "/uploads/x/y.png" });
    expect(res.status).toBe(401);
  });
});
