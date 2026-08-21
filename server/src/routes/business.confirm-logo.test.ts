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
  const res = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
  return res.headers["set-cookie"] as unknown as string[];
}

async function uploadLogo(app: ReturnType<typeof createApp>, cookies: string[]) {
  const buffer = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const res = await request(app).post("/business/logo").set("Cookie", cookies).attach("logo", buffer, "logo.png");
  return res.body.url as string;
}

describe("POST /business/logo/confirm", () => {
  it("writes logoUrl, primaryColor, and accentColors to the business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/confirm")
      .set("Cookie", cookies)
      .send({ url, primaryColor: "#C2185B", accentColors: ["#E0F2FE", "#8F1144"] });

    expect(res.status).toBe(200);
    expect(res.body.business.logoUrl).toBe(url);
    expect(res.body.business.primaryColor).toBe("#C2185B");
    expect(res.body.business.accentColors).toEqual(["#E0F2FE", "#8F1144"]);
  });

  it("rejects an invalid hex color", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/confirm")
      .set("Cookie", cookies)
      .send({ url, primaryColor: "not-a-color", accentColors: [] });

    expect(res.status).toBe(400);
  });

  it("rejects a url belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/business/logo/confirm")
      .set("Cookie", cookies)
      .send({ url: "/uploads/some-other-business/file.png", primaryColor: "#C2185B", accentColors: [] });

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/business/logo/confirm")
      .send({ url: "/uploads/x/y.png", primaryColor: "#C2185B", accentColors: [] });
    expect(res.status).toBe(401);
  });
});
