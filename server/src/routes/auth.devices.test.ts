import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { purgeDeadSessions } from "../lib/session-cleanup.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** A browser's cookie jar: each cookie is kept by name, and only the ones it would send to that path. */
class Browser {
  private jar = new Map<string, { value: string; path: string }>();

  constructor(private readonly app: ReturnType<typeof createApp>, private readonly userAgent: string) {}

  private absorb(setCookie: unknown) {
    for (const raw of (setCookie as string[] | undefined) ?? []) {
      const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
      const [name, value] = pair!.split("=");
      const path = attributes.find((a) => a.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
      if (value === "") this.jar.delete(name!);
      else this.jar.set(name!, { value: value!, path });
    }
  }

  private cookieHeaderFor(url: string): string {
    return [...this.jar.entries()]
      .filter(([, cookie]) => url.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join("; ");
  }

  async send(method: "get" | "post", url: string, body?: object) {
    const call = request(this.app)[method](url).set("User-Agent", this.userAgent).set("Cookie", this.cookieHeaderFor(url));
    const res = await (body ? call.send(body) : call);
    this.absorb(res.headers["set-cookie"]);
    return res;
  }

  signIn(email = "owner@example.com", businessName?: string) {
    return this.send("post", "/auth/session", { idToken: JSON.stringify({ uid: email, email }), businessName });
  }

  get deviceId() {
    return this.jar.get("device_id")?.value;
  }
}

async function liveSessions() {
  return prisma.refreshToken.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "asc" } });
}

describe("one session per device", () => {
  it("names the device a session was made on", async () => {
    const app = createApp();

    await new Browser(app, CHROME_WINDOWS).signIn("owner@example.com", "Kigali Traders");

    const [session] = await liveSessions();
    expect(session).toMatchObject({ deviceName: "Chrome on Windows" });
    expect(session!.deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("replaces the session when the same device signs in again, instead of adding one", async () => {
    const app = createApp();
    const browser = new Browser(app, CHROME_WINDOWS);
    await browser.signIn("owner@example.com", "Kigali Traders");
    await browser.signIn("owner@example.com");
    await browser.signIn("owner@example.com");

    expect(await liveSessions()).toHaveLength(1);
  });

  it("keeps a second device as its own session", async () => {
    const app = createApp();
    await new Browser(app, CHROME_WINDOWS).signIn("owner@example.com", "Kigali Traders");
    await new Browser(app, SAFARI_IPHONE).signIn("owner@example.com");

    const sessions = await liveSessions();
    expect(sessions.map((s) => s.deviceName)).toEqual(["Chrome on Windows", "Safari on iPhone"]);
  });

  it("switching business on a device keeps one session for it", async () => {
    const app = createApp();
    const browser = new Browser(app, CHROME_WINDOWS);
    await browser.signIn("owner@example.com", "Kigali Traders");
    const created = await browser.send("post", "/businesses", { name: "Second Shop" });
    expect(created.status).toBe(201);

    const first = await prisma.business.findFirstOrThrow({ where: { name: "Kigali Traders" } });
    const switched = await browser.send("post", "/auth/switch-business", { businessId: first.id });
    expect(switched.status).toBe(200);

    expect(await liveSessions()).toHaveLength(1);
  });

  it("keeps the device and its name when the session is renewed", async () => {
    const app = createApp();
    const browser = new Browser(app, CHROME_WINDOWS);
    await browser.signIn("owner@example.com", "Kigali Traders");
    const [before] = await liveSessions();

    const res = await browser.send("post", "/auth/refresh");

    expect(res.status).toBe(200);
    const [after] = await liveSessions();
    expect(after!.id).not.toBe(before!.id);
    expect(after).toMatchObject({ deviceId: before!.deviceId, deviceName: "Chrome on Windows", family: before!.family });
  });
});

describe("signing out", () => {
  it("ends the session even though the browser does not send the refresh cookie to /auth/logout", async () => {
    const app = createApp();
    const browser = new Browser(app, CHROME_WINDOWS);
    await browser.signIn("owner@example.com", "Kigali Traders");
    expect(await liveSessions()).toHaveLength(1);

    const res = await browser.send("post", "/auth/logout");

    expect(res.status).toBe(200);
    expect(await liveSessions()).toHaveLength(0);
  });

  it("ends only this device's session", async () => {
    const app = createApp();
    const laptop = new Browser(app, CHROME_WINDOWS);
    const phone = new Browser(app, SAFARI_IPHONE);
    await laptop.signIn("owner@example.com", "Kigali Traders");
    await phone.signIn("owner@example.com");

    await laptop.send("post", "/auth/logout");

    const sessions = await liveSessions();
    expect(sessions.map((s) => s.deviceName)).toEqual(["Safari on iPhone"]);
  });

  it("works with only the device cookie left, once the access token has expired", async () => {
    const app = createApp();
    const browser = new Browser(app, CHROME_WINDOWS);
    await browser.signIn("owner@example.com", "Kigali Traders");

    const res = await request(app).post("/auth/logout").set("Cookie", `device_id=${browser.deviceId}`);

    expect(res.status).toBe(200);
    expect(await liveSessions()).toHaveLength(0);
  });

  it("does not keep listing a session after signing out and back in", async () => {
    const app = createApp();
    const browser = new Browser(app, CHROME_WINDOWS);
    await browser.signIn("owner@example.com", "Kigali Traders");
    await browser.send("post", "/auth/logout");
    await browser.signIn("owner@example.com");

    const list = await browser.send("get", "/profile/sessions");

    expect(list.body.results).toHaveLength(1);
  });
});

describe("the signed in devices list", () => {
  it("names each device, marks this one, and orders by last use", async () => {
    const app = createApp();
    const laptop = new Browser(app, CHROME_WINDOWS);
    const phone = new Browser(app, SAFARI_IPHONE);
    await laptop.signIn("owner@example.com", "Kigali Traders");
    await phone.signIn("owner@example.com");

    const list = await laptop.send("get", "/profile/sessions");

    expect(list.status).toBe(200);
    expect(list.body.results).toHaveLength(2);
    const current = list.body.results.filter((row: { isCurrent: boolean }) => row.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ deviceName: "Chrome on Windows" });
    expect(list.body.results.map((row: { deviceName: string }) => row.deviceName)).toContain("Safari on iPhone");
    expect(list.body.results[0]).toHaveProperty("lastUsedAt");
  });

  it("signs out the other devices and never this one", async () => {
    const app = createApp();
    const laptop = new Browser(app, CHROME_WINDOWS);
    const phone = new Browser(app, SAFARI_IPHONE);
    await laptop.signIn("owner@example.com", "Kigali Traders");
    await phone.signIn("owner@example.com");

    await laptop.send("post", "/profile/sessions/revoke-others");

    const sessions = await liveSessions();
    expect(sessions.map((s) => s.deviceName)).toEqual(["Chrome on Windows"]);
    const refresh = await phone.send("post", "/auth/refresh");
    expect(refresh.status).toBe(401);
  });

  it("signs out one chosen device", async () => {
    const app = createApp();
    const laptop = new Browser(app, CHROME_WINDOWS);
    const phone = new Browser(app, SAFARI_IPHONE);
    await laptop.signIn("owner@example.com", "Kigali Traders");
    await phone.signIn("owner@example.com");
    const list = await laptop.send("get", "/profile/sessions");
    const phoneRow = list.body.results.find((row: { deviceName: string }) => row.deviceName === "Safari on iPhone");

    const res = await laptop.send("post", `/profile/sessions/${phoneRow.id}/revoke`);

    expect(res.status).toBe(200);
    expect((await liveSessions()).map((s) => s.deviceName)).toEqual(["Chrome on Windows"]);
  });

  it("lets the app name itself in a header", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/session")
      .set("X-Billa-Device", "Billa app on Pixel 8")
      .send({ idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }), businessName: "Kigali Traders" });

    expect((await liveSessions())[0]!.deviceName).toBe("Billa app on Pixel 8");
  });
});

describe("purgeDeadSessions", () => {
  it("deletes expired sessions and ones revoked a while ago, and keeps live and recently revoked ones", async () => {
    const app = createApp();
    const user = await new Browser(app, CHROME_WINDOWS).signIn("owner@example.com", "Kigali Traders");
    const userId = user.body.user.id as string;
    const businessId = user.body.business.id as string;
    const now = new Date("2026-10-30T12:00:00Z");
    const base = { userId, businessId, family: "f", deviceId: null, deviceName: null };
    await prisma.refreshToken.createMany({
      data: [
        { ...base, tokenHash: "expired", expiresAt: new Date("2026-10-01T00:00:00Z") },
        { ...base, tokenHash: "old-revoked", expiresAt: new Date("2026-12-01T00:00:00Z"), revokedAt: new Date("2026-10-01T00:00:00Z") },
        { ...base, tokenHash: "fresh-revoked", expiresAt: new Date("2026-12-01T00:00:00Z"), revokedAt: new Date("2026-10-29T00:00:00Z") },
        { ...base, tokenHash: "live", expiresAt: new Date("2026-12-01T00:00:00Z") },
      ],
    });

    const purged = await purgeDeadSessions(now);

    expect(purged).toBe(2);
    const left = (await prisma.refreshToken.findMany({ where: { tokenHash: { in: ["expired", "old-revoked", "fresh-revoked", "live"] } } })).map((row) => row.tokenHash).sort();
    expect(left).toEqual(["fresh-revoked", "live"]);
  });
});
