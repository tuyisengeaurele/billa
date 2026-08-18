import { describe, expect, it } from "vitest";
import { confirmLogoSchema, logoUrlSchema } from "./logo-schemas.js";

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

describe("confirmLogoSchema", () => {
  it("accepts a valid confirm payload", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      primaryColor: "#C2185B",
      accentColors: ["#E0F2FE", "#8F1144"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty accentColors array", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      primaryColor: "#C2185B",
      accentColors: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid hex color", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      primaryColor: "not-a-color",
      accentColors: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing primaryColor", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      accentColors: [],
    });
    expect(result.success).toBe(false);
  });
});
