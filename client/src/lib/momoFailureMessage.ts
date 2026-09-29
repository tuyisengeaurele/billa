const GENERIC = "The payment didn't go through.";

const KNOWN_REASONS: Record<string, string> = {
  NOT_ENOUGH_FUNDS: "Your MoMo balance is too low for this payment.",
  PAYER_NOT_FOUND: "That number isn't registered for MTN MoMo. Check it and try again.",
  PAYER_LIMIT_REACHED: "This payment is over your MoMo limit.",
  APPROVAL_REJECTED: "The payment was declined on your phone.",
  TRANSACTION_CANCELED: "The payment was cancelled.",
  EXPIRED: "The payment request expired before it was approved.",
  SERVICE_UNAVAILABLE: "MTN MoMo isn't responding right now. Try again in a few minutes.",
  INTERNAL_PROCESSING_ERROR: "MTN MoMo had a problem. Try again in a few minutes.",
  already_paid: "This invoice has already been paid.",
};

/** Turns the reason MTN (or our own reconciliation) stored into something a customer can act on. */
export function momoFailureMessage(reason: string | null | undefined): string {
  if (!reason) return GENERIC;
  const known = KNOWN_REASONS[reason];
  if (known) return known;
  // An unrecognized code like "SOME_NEW_CODE" means nothing to a customer; a sentence does.
  return /^[A-Za-z]+(_[A-Za-z]+)+$/.test(reason) ? GENERIC : reason;
}
