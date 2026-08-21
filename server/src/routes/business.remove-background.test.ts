import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
  process.env.REMBG_SERVICE_URL ??= "http://localhost:8000/remove-background";
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

describe("POST /business/logo/remove-background", () => {
  it("passes through an already-transparent logo without calling the removal service", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies, 0);
    const fetchSpy = vi.spyOn(global, "fetch");

    const res = await request(app).post("/business/logo/remove-background").set("Cookie", cookies).send({ url });

    expect(res.status).toBe(200);
    expect(res.body.backgroundRemoved).toBe(false);
    expect(res.body.url).toBe(url);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls the removal service and returns a new url for an opaque logo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies, 1);

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
    } as Response);

    const res = await request(app).post("/business/logo/remove-background").set("Cookie", cookies).send({ url });

    expect(res.status).toBe(200);
    expect(res.body.backgroundRemoved).toBe(true);
    expect(res.body.url).not.toBe(url);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\/[\w-]+\.png$/);
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
