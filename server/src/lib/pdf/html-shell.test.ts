import { describe, expect, it } from "vitest";
import { htmlDocumentShell } from "./html-shell.js";

describe("htmlDocumentShell", () => {
  it("wraps the body in a full HTML document with the title and fonts embedded", () => {
    const html = htmlDocumentShell("INV-0001", "", "<p>hello</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>INV-0001</title>");
    expect(html).toContain("<p>hello</p>");
    expect(html).toContain('font-family: "Fraunces"');
  });

  it("includes any extra template-specific styles passed in", () => {
    const html = htmlDocumentShell("t", ".sidebar { width: 30%; }", "<div></div>");
    expect(html).toContain(".sidebar { width: 30%; }");
  });
});
