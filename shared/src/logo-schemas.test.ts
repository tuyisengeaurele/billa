import { describe, expect, it } from "vitest";
import { logoUrlSchema } from "./logo-schemas.js";

describe("logoUrlSchema", () => {
  it("accepts a non-empty url", () => {
    expect(logoUrlSchema.safeParse({ url: "/uploads/biz123/file.png" }).success).toBe(true);
  });

  it("rejects an empty url", () => {
    expect(logoUrlSchema.safeParse({ url: "" }).success).toBe(false);
  });

  it("rejects a missing url", () => {
    expect(logoUrlSchema.safeParse({}).success).toBe(false);
  });
});
