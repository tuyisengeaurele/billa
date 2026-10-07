import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type JobLockResult<T> = { ran: true; value: T } | { ran: false };

/**
 * Runs `work` only if no other server holds the lease named `name`. The lease lasts `leaseMs` at most, so a
 * server that crashes mid-run cannot block the job for good, and it is released as soon as the work ends.
 *
 * The database's own clock decides who holds it, so two servers with slightly different clocks cannot both win.
 * The column has no timezone and Prisma writes UTC into it, so every comparison here is made in UTC too.
 */
export async function withJobLock<T>(name: string, leaseMs: number, work: () => Promise<T>): Promise<JobLockResult<T>> {
  const owner = crypto.randomUUID();

  const taken = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
    INSERT INTO "JobLock" ("name", "lockedUntil", "lockedBy")
    VALUES (${name}, (now() AT TIME ZONE 'UTC') + (${leaseMs} * interval '1 millisecond'), ${owner})
    ON CONFLICT ("name") DO UPDATE
      SET "lockedUntil" = EXCLUDED."lockedUntil", "lockedBy" = EXCLUDED."lockedBy"
      WHERE "JobLock"."lockedUntil" < (now() AT TIME ZONE 'UTC')
    RETURNING "name"
  `);
  if (taken.length === 0) return { ran: false };

  try {
    return { ran: true, value: await work() };
  } finally {
    // Only release a lease that is still ours: if it expired and another server took it, leave it alone.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "JobLock" SET "lockedUntil" = (now() AT TIME ZONE 'UTC') WHERE "name" = ${name} AND "lockedBy" = ${owner}
    `);
  }
}
