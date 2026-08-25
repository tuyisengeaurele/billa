import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { hasBusinessAccess } from "./business-access.js";

beforeEach(resetDb);

let userCounter = 0;

async function createUser() {
  userCounter += 1;
  return prisma.user.create({
    data: {
      email: `user${userCounter}@example.com`,
      firebaseUid: `firebase-uid-${userCounter}`,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

describe("hasBusinessAccess", () => {
  it("returns true for the owner", async () => {
    const owner = await createUser();
    const business = await prisma.business.create({ data: { ownerId: owner.id, name: "Kigali Traders" } });

    expect(await hasBusinessAccess(owner.id, business.id)).toBe(true);
  });

  it("returns true for a member", async () => {
    const owner = await createUser();
    const member = await createUser();
    const business = await prisma.business.create({ data: { ownerId: owner.id, name: "Kigali Traders" } });
    await prisma.businessMember.create({ data: { businessId: business.id, userId: member.id } });

    expect(await hasBusinessAccess(member.id, business.id)).toBe(true);
  });

  it("returns false for an unrelated user", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const business = await prisma.business.create({ data: { ownerId: owner.id, name: "Kigali Traders" } });

    expect(await hasBusinessAccess(stranger.id, business.id)).toBe(false);
  });

  it("returns false for a business that doesn't exist", async () => {
    const user = await createUser();

    expect(await hasBusinessAccess(user.id, "nonexistent")).toBe(false);
  });
});
