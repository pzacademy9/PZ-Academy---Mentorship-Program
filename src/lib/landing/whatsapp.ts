// src/lib/landing/whatsapp.ts
// Pure helpers for the shared WhatsApp number list (safe to import from client code).

export const OFFICIAL_WHATSAPP: readonly { label: string; number: string }[] = [
  { label: "PZ Academy main", number: "923700199429" },
  { label: "PZ Academy second", number: "923242167718" },
];

/** Strips spaces, "+", dashes and brackets. Digits only, 8 to 15 of them, otherwise null. */
export function cleanWhatsappNumber(input: string): string | null {
  const stripped = input.replace(/[\s+\-()[\]]/g, "");
  return /^[0-9]{8,15}$/.test(stripped) ? stripped : null;
}
