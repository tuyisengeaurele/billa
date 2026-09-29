import { describe, expect, it } from "vitest";
import { createApiKeySchema } from "./api-key-schemas.js";

describe("createApiKeySchema", () => {
  it("accepts a short name and trims it", () => {
    expect(createApiKeySchema.parse({ name: "  Accounting sync " })).toEqual({ name: "Accounting sync" });
  });

  it("rejects a blank or overlong name", () => {
    expect(createApiKeySchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createApiKeySchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });
});
