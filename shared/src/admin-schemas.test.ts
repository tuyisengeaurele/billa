import { describe, expect, it } from "vitest";
import {
  adminAuditLogQuerySchema,
  adminBusinessListQuerySchema,
  adminUserListQuerySchema,
  extendTrialSchema,
  postAnnouncementSchema,
} from "./admin-schemas.js";

describe("adminAuditLogQuerySchema", () => {
  it("defaults page, pageSize, sortBy, and sortOrder", () => {
    const result = adminAuditLogQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" });
  });

  it("rejects a pageSize over 100", () => {
    expect(adminAuditLogQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});

describe("adminUserListQuerySchema", () => {
  it("defaults page, pageSize, sortBy, and sortOrder", () => {
    const result = adminUserListQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" });
  });

  it("accepts a search term", () => {
    expect(adminUserListQuerySchema.parse({ search: "acme" }).search).toBe("acme");
  });

  it("accepts sortBy email", () => {
    expect(adminUserListQuerySchema.parse({ sortBy: "email" }).sortBy).toBe("email");
  });
});

describe("adminBusinessListQuerySchema", () => {
  it("defaults page, pageSize, sortBy, and sortOrder", () => {
    const result = adminBusinessListQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" });
  });

  it("accepts sortBy name", () => {
    expect(adminBusinessListQuerySchema.parse({ sortBy: "name" }).sortBy).toBe("name");
  });
});

describe("extendTrialSchema", () => {
  it("accepts a positive number of days", () => {
    expect(extendTrialSchema.safeParse({ days: 14 }).success).toBe(true);
  });

  it("rejects zero or negative days", () => {
    expect(extendTrialSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(extendTrialSchema.safeParse({ days: -5 }).success).toBe(false);
  });

  it("rejects more than 365 days", () => {
    expect(extendTrialSchema.safeParse({ days: 366 }).success).toBe(false);
  });
});

describe("postAnnouncementSchema", () => {
  it("accepts a non-empty message and trims it", () => {
    expect(postAnnouncementSchema.parse({ message: "  Scheduled maintenance tonight  " }).message).toBe(
      "Scheduled maintenance tonight",
    );
  });

  it("rejects an empty message", () => {
    expect(postAnnouncementSchema.safeParse({ message: "   " }).success).toBe(false);
  });

  it("rejects a message over 500 characters", () => {
    expect(postAnnouncementSchema.safeParse({ message: "a".repeat(501) }).success).toBe(false);
  });
});
