import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageTitleProvider, usePageTitle } from "../context/PageTitleContext";
import { DocumentTitleSync } from "./DocumentTitleSync";

function PageStub({ title }: { title: string | { label: string; href?: string }[] }) {
  usePageTitle(title);
  return null;
}

describe("DocumentTitleSync", () => {
  it("sets the browser tab title from a plain string page title", async () => {
    render(
      <PageTitleProvider>
        <DocumentTitleSync />
        <PageStub title="Items" />
      </PageTitleProvider>,
    );

    expect(document.title).toBe("Items - Billa");
  });

  it("uses the last segment when the page title is a breadcrumb", async () => {
    render(
      <PageTitleProvider>
        <DocumentTitleSync />
        <PageStub title={[{ label: "Users", href: "/admin/users" }, { label: "owner@example.com" }]} />
      </PageTitleProvider>,
    );

    expect(document.title).toBe("owner@example.com - Billa");
  });

  it("falls back to plain Billa when no page title has been set", () => {
    render(
      <PageTitleProvider>
        <DocumentTitleSync />
      </PageTitleProvider>,
    );

    expect(document.title).toBe("Billa");
  });
});
