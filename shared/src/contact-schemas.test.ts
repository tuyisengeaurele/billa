import { describe, expect, it } from "vitest";
import { contactMessageSchema } from "./contact-schemas.js";

describe("contactMessageSchema", () => {
  it("accepts a valid message", () => {
    expect(
      contactMessageSchema.safeParse({
        name: "Aline",
        email: "aline@example.com",
        message: "I'd like help setting up my templates.",
      }).success,
    ).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(contactMessageSchema.safeParse({ email: "aline@example.com", message: "Need help please" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid email", () => {
    expect(
      contactMessageSchema.safeParse({ name: "Aline", email: "not-an-email", message: "Need help please" }).success,
    ).toBe(false);
  });

  it("rejects a message that's too short", () => {
    expect(
      contactMessageSchema.safeParse({ name: "Aline", email: "aline@example.com", message: "Hi" }).success,
    ).toBe(false);
  });
});
