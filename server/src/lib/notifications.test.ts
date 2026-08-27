import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { createNotification, notifyAdmins } from "./notifications.js";

beforeEach(resetDb);

async function createUser(email: string, isAdmin = false) {
  return prisma.user.create({
    data: {
      email,
      firebaseUid: `firebase-${email}`,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      isAdmin,
    },
  });
}

describe("createNotification", () => {
  it("writes a notification row for the given user", async () => {
    const user = await createUser("owner@example.com");

    await createNotification({
      userId: user.id,
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      body: "INV-0001 was paid",
      link: "/documents/doc1",
    });

    const rows = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      body: "INV-0001 was paid",
      link: "/documents/doc1",
      readAt: null,
    });
  });
});

describe("notifyAdmins", () => {
  it("writes one notification per admin user, and none for non-admins", async () => {
    const admin1 = await createUser("admin1@example.com", true);
    const admin2 = await createUser("admin2@example.com", true);
    const owner = await createUser("owner@example.com", false);

    await notifyAdmins({
      type: "CONTACT_MESSAGE_RECEIVED",
      title: "New message from Fred",
      link: "/admin/messages",
    });

    const admin1Rows = await prisma.notification.findMany({ where: { userId: admin1.id } });
    const admin2Rows = await prisma.notification.findMany({ where: { userId: admin2.id } });
    const ownerRows = await prisma.notification.findMany({ where: { userId: owner.id } });

    expect(admin1Rows).toHaveLength(1);
    expect(admin2Rows).toHaveLength(1);
    expect(ownerRows).toHaveLength(0);
  });

  it("does nothing when there are no admins", async () => {
    await createUser("owner@example.com", false);

    await notifyAdmins({ type: "CONTACT_MESSAGE_RECEIVED", title: "New message" });

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(0);
  });
});
