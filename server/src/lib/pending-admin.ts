import crypto from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "./prisma.js";

// A real system admin, added directly by another admin (see admin.ts's
// POST /admins), doesn't have a Firebase account yet - they haven't signed in
// for the first time. firebaseUid is @unique and non-null in the schema, so
// this stands in for "not linked yet" without a migration to make it nullable:
// guaranteed unique (a random UUID), and never collides with a real Firebase
// UID (always exactly 28 base62 characters, never containing a colon). Every
// business-less/admin-only flow this session already treats a bare-string
// sentinel like this as the normal, expected shape (see the "" businessId
// sentinel in auth.ts and session.ts) rather than something needing a schema
// change - this follows the same pattern.
const PENDING_FIREBASE_UID_PREFIX = "pending:";

export function createPendingFirebaseUid(): string {
  return `${PENDING_FIREBASE_UID_PREFIX}${crypto.randomUUID()}`;
}

// Looked up by email, not firebaseUid - the whole point is that this account
// has no real Firebase UID yet. Only ever matches a row this same module
// created, since the prefix is never a real Firebase UID.
export function findPendingAdminByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email, firebaseUid: { startsWith: PENDING_FIREBASE_UID_PREFIX } },
  });
}
