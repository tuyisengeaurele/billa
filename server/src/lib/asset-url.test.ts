import { afterEach, describe, expect, it } from "vitest";
import { buildPublicAssetUrl } from "./asset-url.js";

describe("buildPublicAssetUrl", () => {
  afterEach(() => {
    delete process.env.R2_PUBLIC_URL;
    delete process.env.API_URL;
    delete process.env.RENDER_EXTERNAL_URL;
  });

  it("returns null for a null path", () => {
    expect(buildPublicAssetUrl(null)).toBeNull();
  });

  it("prefers a configured R2 public URL, since it is reachable from anywhere", () => {
    process.env.R2_PUBLIC_URL = "https://pub-abc123.r2.dev";

    expect(buildPublicAssetUrl("/uploads/biz1/logo.png")).toBe("https://pub-abc123.r2.dev/biz1/logo.png");
  });

  it("strips a trailing slash from the configured R2 public URL", () => {
    process.env.R2_PUBLIC_URL = "https://pub-abc123.r2.dev/";

    expect(buildPublicAssetUrl("/uploads/biz1/logo.png")).toBe("https://pub-abc123.r2.dev/biz1/logo.png");
  });

  it("falls back to API_URL when no R2 public URL is configured", () => {
    process.env.API_URL = "https://api.billa.rw";

    expect(buildPublicAssetUrl("/uploads/biz1/logo.png")).toBe("https://api.billa.rw/uploads/biz1/logo.png");
  });

  it("falls back to localhost when neither is configured, for local dev", () => {
    expect(buildPublicAssetUrl("/uploads/biz1/logo.png")).toBe("http://localhost:4000/uploads/biz1/logo.png");
  });

  it("prefers RENDER_EXTERNAL_URL over API_URL when no R2 public URL is configured", () => {
    // Regression case: RENDER_EXTERNAL_URL is set automatically by Render for
    // every web service - API_URL is a value someone has to remember to fill
    // in by hand, and it going unset used to mean this silently fell back to
    // an unreachable localhost URL in production.
    process.env.RENDER_EXTERNAL_URL = "https://billa-api-og7v.onrender.com";
    process.env.API_URL = "https://api.billa.rw";

    expect(buildPublicAssetUrl("/uploads/biz1/logo.png")).toBe(
      "https://billa-api-og7v.onrender.com/uploads/biz1/logo.png",
    );
  });
});
