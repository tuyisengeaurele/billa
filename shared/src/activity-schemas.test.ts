import { describe, expect, it } from "vitest";
import { activityListQuerySchema } from "./activity-schemas.js";

describe("activityListQuerySchema", () => {
  it("defaults page, pageSize, sortBy, and sortOrder", () => {
    const result = activityListQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" });
  });

  it("accepts an optional actorUserId filter", () => {
    const result = activityListQuerySchema.parse({ actorUserId: "user-1" });
    expect(result.actorUserId).toBe("user-1");
  });

  it("rejects a pageSize over 100", () => {
    expect(activityListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});
