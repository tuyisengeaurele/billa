import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape-html.js";

describe("escapeHtml", () => {
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml(`<script>alert("hi") & 'bye'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;hi&quot;) &amp; &#39;bye&#39;&lt;/script&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Kigali Traders Ltd")).toBe("Kigali Traders Ltd");
  });
});
