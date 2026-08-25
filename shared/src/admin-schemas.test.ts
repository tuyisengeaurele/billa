import { describe, expect, it } from "vitest";
import { adminAuditLogQuerySchema } from "./admin-schemas.js";

describe("adminAuditLogQuerySchema", () => {
  it("defaults page, pageSize, sortBy, and sortOrder", () => {
    const result = adminAuditLogQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" });
  });

  it("rejects a pageSize over 100", () => {
    expect(adminAuditLogQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});
