import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Runs `findExisting` then, if nothing came back, `create` inside a Postgres advisory
 * lock scoped to `lockKey`. Without this, two near-simultaneous requests for the same
 * logical payment (a double-click, a client retry after a slow response) can both pass
 * the "is one already pending?" check before either write commits, and both go on to
 * fire a real MTN Mobile Money request - charging the customer twice for one action.
 * `pg_advisory_xact_lock` serializes those two requests on the same key: the second
 * one blocks until the first's transaction commits, then sees the row the first one
 * created and reuses it instead of creating a duplicate.
 *
 * The lock is released automatically when the transaction ends, and this never wraps
 * the actual MTN API call - callers make that call afterwards, outside the lock, so a
 * slow network round-trip to MTN never holds a DB connection or blocks other requests.
 */
export async function getOrCreatePendingPayment<T>(
  lockKey: string,
  findExisting: (tx: Prisma.TransactionClient) => Promise<T | null>,
  create: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ payment: T; isNew: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const existing = await findExisting(tx);
    if (existing) return { payment: existing, isNew: false };
    const payment = await create(tx);
    return { payment, isNew: true };
  });
}
