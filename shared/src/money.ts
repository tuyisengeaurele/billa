export function formatRwf(amountInRwf: number): string {
  return `${amountInRwf.toLocaleString("en-US")} RWF`;
}

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]);
    }
  }

  return parts.join(" ");
}

export function numberToWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "Zero";

  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const words = threeDigitsToWords(groups[i]);
    parts.push(SCALES[i] ? `${words} ${SCALES[i]}` : words);
  }

  return parts.join(" ");
}

export function amountInWordsRwf(amountInRwf: number): string {
  return `${numberToWords(amountInRwf)} Rwandan Francs Only`;
}

const ONES_FR = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS_FR: Record<number, string> = {
  2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante", 8: "quatre-vingt",
};
const SCALES_FR = ["", "mille", "million", "milliard", "billion"];

function twoDigitsToWordsFr(n: number): string {
  if (n <= 19) return ONES_FR[n];

  const tens = Math.floor(n / 10);
  const ones = n % 10;

  // 70-79 and 90-99 are built on soixante/quatre-vingt + (10 + ones), e.g.
  // 71 = soixante et onze, 92 = quatre-vingt-douze.
  if (tens === 7 || tens === 9) {
    const base = tens === 7 ? "soixante" : "quatre-vingt";
    if (tens === 7 && ones === 1) return `${base} et onze`;
    return `${base}-${ONES_FR[10 + ones]}`;
  }

  const tensWord = TENS_FR[tens];
  if (ones === 0) {
    // quatre-vingts takes a plural 's' only when bare; 81-89 don't.
    return tens === 8 ? `${tensWord}s` : tensWord;
  }
  if (ones === 1 && tens !== 8) {
    return `${tensWord} et un`;
  }
  return `${tensWord}-${ONES_FR[ones]}`;
}

function threeDigitsToWordsFr(n: number): string {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const parts: string[] = [];

  if (hundreds > 0) {
    // "cent" is invariable for exactly one hundred, and loses its plural 's'
    // as soon as anything follows it (deux cents, but deux cent trente).
    parts.push(hundreds === 1 ? "cent" : `${ONES_FR[hundreds]} cent${remainder === 0 ? "s" : ""}`);
  }
  if (remainder > 0) {
    parts.push(twoDigitsToWordsFr(remainder));
  }

  return parts.join(" ");
}

function numberToWordsFr(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "Zéro";

  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (group === 0) continue;
    const words = threeDigitsToWordsFr(group);

    if (i === 0) {
      parts.push(words);
    } else if (i === 1) {
      // "mille" never pluralizes and never takes "un" for a bare thousand.
      parts.push(group === 1 ? "mille" : `${words} mille`);
    } else {
      parts.push(`${words} ${SCALES_FR[i]}${group > 1 ? "s" : ""}`);
    }
  }

  const result = parts.join(" ");
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function amountInWordsFr(amountInRwf: number): string {
  return `${numberToWordsFr(amountInRwf)} Francs Rwandais Seulement`;
}
