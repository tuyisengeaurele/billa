// MTN's Mobile Money API identifies a payer by MSISDN: the full number with the
// country code and no "+", spaces, or leading zero (e.g. "250788123456"). People
// naturally type their own number in local format ("0788 123 456") or with a "+"
// prefix, and neither of those reaches MTN correctly - a request-to-pay for
// "0788123456" fails as a foreign/malformed number, not as "add the country code".
// Normalizing whatever shape someone typed, once, in the one place every payment
// flow already funnels through, means that failure mode just doesn't happen.
export function normalizeRwandaPhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("250")) return digits;
  if (digits.startsWith("0")) return `250${digits.slice(1)}`;
  if (digits.length === 9) return `250${digits}`;
  return digits;
}
