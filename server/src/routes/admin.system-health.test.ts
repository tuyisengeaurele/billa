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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, isAdmin = false) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  if (isAdmin) {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { isAdmin: true } });
  }
  return { cookies: res.headers["set-cookie"] as unknown as string[] };
}

describe("GET /admin/system-health", () => {
  it("returns the latest run per job plus DB connectivity", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    await prisma.jobRunLog.create({
      data: { jobName: "recurring-documents", succeeded: true, resultCount: 2, ranAt: new Date(Date.now() - 60000) },
    });
    await prisma.jobRunLog.create({
      data: { jobName: "recurring-documents", succeeded: false, errorMessage: "boom" },
    });
    await prisma.jobRunLog.create({
      data: { jobName: "overdue-reminders", succeeded: true, resultCount: 5 },
    });

    const res = await request(app).get("/admin/system-health").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.dbConnected).toBe(true);
    expect(res.body.jobs).toHaveLength(2);
    const recurring = res.body.jobs.find((j: { jobName: string }) => j.jobName === "recurring-documents");
    expect(recurring).toMatchObject({ succeeded: false, errorMessage: "boom" });
    const overdue = res.body.jobs.find((j: { jobName: string }) => j.jobName === "overdue-reminders");
    expect(overdue).toMatchObject({ succeeded: true, resultCount: 5 });
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/admin/system-health").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});
