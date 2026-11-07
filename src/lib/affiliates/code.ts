// src/lib/affiliates/code.ts
// Pure rules for new affiliate codes: first letter of the first and last name, then a running number (AK321).
// Titles (Dr, Mr, Prof ...) are ignored. Old affiliate codes are never rebuilt with this.
const TITLES = new Set(["dr", "mr", "ms", "mrs", "miss", "prof", "professor", "engr", "engineer", "sir", "madam", "madame"]);
const FALLBACK = "AF";

function latinLetters(word: string): string {
  return word.replace(/[^A-Za-z]/g, "");
}

/** The words of a name that carry letters, without titles. */
function nameWords(name: string): string[] {
  return name
    .split(/\s+/)
    .filter((w) => latinLetters(w) !== "" && !TITLES.has(latinLetters(w).toLowerCase()));
}

/** Two uppercase letters: first and last name initials, or the first two letters of a one-word name, or "AF". */
export function initialsFor(name: string): string {
  const words = nameWords(name);
  if (words.length === 0) return FALLBACK;
  if (words.length === 1) {
    const letters = latinLetters(words[0]);
    return letters.length >= 2 ? letters.slice(0, 2).toUpperCase() : FALLBACK;
  }
  return (latinLetters(words[0])[0] + latinLetters(words[words.length - 1])[0]).toUpperCase();
}

export function buildAffiliateCode(name: string, serial: number): string {
  return `${initialsFor(name)}${serial}`;
}
