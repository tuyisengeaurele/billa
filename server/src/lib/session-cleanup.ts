import { prisma } from "./prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// A revoked session is kept a while so a stolen, already-used token can still be recognised as reuse.
const KEEP_REVOKED_DAYS = 14;

/** Deletes sessions nobody can use any more: expired ones, and ones revoked a couple of weeks ago. */
export async function purgeDeadSessions(now = new Date()): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } },
        { revokedAt: { lt: new Date(now.getTime() - KEEP_REVOKED_DAYS * DAY_MS) } },
      ],
    },
  });
  return result.count;
}
