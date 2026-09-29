// wa.me wants the full international number: digits only, no "+", no leading zero.
// Rwandan numbers are usually typed in local form, so those get 250 added; a number
// already written with another country code is left as it is.
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("250")) return digits.length === 12 ? digits : null;
  if (digits.startsWith("0")) digits = `250${digits.slice(1)}`;
  else if (digits.length === 9) digits = `250${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
