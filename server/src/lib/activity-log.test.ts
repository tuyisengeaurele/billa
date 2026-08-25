import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { logActivity } from "./activity-log.js";

beforeEach(resetDb);

async function setupBusiness() {
  const user = await prisma.user.create({
    data: {
      email: "owner@example.com",
      firebaseUid: "firebase-uid-1",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  const business = await prisma.business.create({ data: { ownerId: user.id, name: "Kigali Traders" } });
  return { user, business };
}

describe("logActivity", () => {
  it("writes a row with the given fields", async () => {
    const { user, business } = await setupBusiness();

    await logActivity({
      businessId: business.id,
      actorUserId: user.id,
      action: "DOCUMENT_CREATED",
      entityType: "Document",
      entityId: "doc-1",
      metadata: { type: "INVOICE" },
    });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId: business.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId: business.id,
      actorUserId: user.id,
      action: "DOCUMENT_CREATED",
      entityType: "Document",
      entityId: "doc-1",
      metadata: { type: "INVOICE" },
    });
  });

  it("writes a row with no metadata", async () => {
    const { user, business } = await setupBusiness();

    await logActivity({
      businessId: business.id,
      actorUserId: user.id,
      action: "MEMBER_JOINED",
      entityType: "BusinessMember",
      entityId: "member-1",
    });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId: business.id } });
    expect(rows[0].metadata).toBeNull();
  });
});
