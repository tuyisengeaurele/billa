import { describe, expect, it } from "vitest";
import { momoFailureMessage } from "./momoFailureMessage";

describe("momoFailureMessage", () => {
  it("explains a known MTN reason in plain words", () => {
    expect(momoFailureMessage("NOT_ENOUGH_FUNDS")).toBe("Your MoMo balance is too low for this payment.");
    expect(momoFailureMessage("PAYER_NOT_FOUND")).toBe("That number isn't registered for MTN MoMo. Check it and try again.");
  });

  it("explains that the invoice was already paid", () => {
    expect(momoFailureMessage("already_paid")).toBe("This invoice has already been paid.");
  });

  it("keeps a readable reason as it is", () => {
    expect(momoFailureMessage("Payer rejected")).toBe("Payer rejected");
  });

  it("hides an unknown machine code behind a generic message", () => {
    expect(momoFailureMessage("SOME_NEW_CODE")).toBe("The payment didn't go through.");
  });

  it("falls back to a generic message when there is no reason", () => {
    expect(momoFailureMessage(null)).toBe("The payment didn't go through.");
    expect(momoFailureMessage(undefined)).toBe("The payment didn't go through.");
  });
});
