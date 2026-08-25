import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { logAdminAction } from "./admin-audit-log.js";

beforeEach(resetDb);

async function createAdmin() {
  return prisma.user.create({
    data: {
      email: "admin@example.com",
      firebaseUid: "firebase-uid-admin",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      isAdmin: true,
    },
  });
}

describe("logAdminAction", () => {
  it("writes a row with the given fields", async () => {
    const admin = await createAdmin();

    await logAdminAction({
      adminUserId: admin.id,
      action: "TRIAL_EXTENDED",
      targetType: "User",
      targetId: "user-1",
      metadata: { days: 14 },
    });

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { adminUserId: admin.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      adminUserId: admin.id,
      action: "TRIAL_EXTENDED",
      targetType: "User",
      targetId: "user-1",
      metadata: { days: 14 },
    });
  });

  it("writes a row with no metadata", async () => {
    const admin = await createAdmin();

    await logAdminAction({
      adminUserId: admin.id,
      action: "ADMIN_GRANTED",
      targetType: "User",
      targetId: "user-1",
    });

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { adminUserId: admin.id } });
    expect(rows[0].metadata).toBeNull();
  });
});
