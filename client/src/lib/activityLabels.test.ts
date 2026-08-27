import { describe, expect, it } from "vitest";
import { describeActivity } from "./activityLabels";

describe("describeActivity", () => {
  it("describes a created document by type", () => {
    expect(describeActivity("DOCUMENT_CREATED", { type: "INVOICE" })).toBe("created an invoice");
  });

  it("describes a finalized document by number when available", () => {
    expect(describeActivity("DOCUMENT_FINALIZED", { type: "INVOICE", number: "INV-0004" })).toBe("finalized INV-0004");
  });

  it("describes a created customer by name", () => {
    expect(describeActivity("CUSTOMER_CREATED", { name: "Acme Ltd" })).toBe("added customer Acme Ltd");
  });

  it("describes an invite by email", () => {
    expect(describeActivity("MEMBER_INVITED", { email: "friend@example.com" })).toBe("invited friend@example.com");
  });

  it("describes an owner impersonating a member by email", () => {
    expect(describeActivity("MEMBER_IMPERSONATION_STARTED", { email: "fred@example.com" })).toBe(
      "viewed the account as fred@example.com",
    );
  });

  it("describes an owner ending impersonation of a member by email", () => {
    expect(describeActivity("MEMBER_IMPERSONATION_ENDED", { email: "fred@example.com" })).toBe(
      "stopped viewing the account as fred@example.com",
    );
  });

  it("falls back gracefully when metadata is missing", () => {
    expect(describeActivity("MEMBER_JOINED", null)).toBe("joined the team");
  });

  it("falls back to the raw action for an unrecognized action", () => {
    expect(describeActivity("SOMETHING_NEW", null)).toBe("SOMETHING_NEW");
  });
});
