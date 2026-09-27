/**
 * Heuristic extraction from raw WhatsApp chat text pasted by a sales agent.
 * Every result here is a suggestion for the editable preview form, never
 * written to the database directly — phone in particular is never trusted
 * from extraction: a WhatsApp chat's phone number is the chat's own number
 * (shown by WhatsApp's UI), not something the customer typed in the
 * message text, so this is a best-effort pre-fill only.
 */
import { normalizePhone } from "@/lib/crm/phone";

export function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

export function extractPhone(text: string): string | null {
  const candidates = text.match(/\+?\d[\d\s-]{7,}\d/g) ?? [];
  for (const candidate of candidates) {
    const result = normalizePhone(candidate);
    if (result.ok) return result.e164;
  }
  return null;
}

const NAME_PATTERNS = [
  /\b(?:my\s+name\s+is|[Ii]\s*'?\s*m|[Ii]\s+am|[Tt]his\s+is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/,
];

export function extractName(text: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

const PROFESSION_PATTERNS = [
  /\bi\s*'?\s*m\s+an?\s+([a-z][a-z\s'-]{2,60}?)(?=[.,!\n]|$)/i,
  /\bi\s+am\s+an?\s+([a-z][a-z\s'-]{2,60}?)(?=[.,!\n]|$)/i,
  /\bi\s+work\s+as\s+an?\s+([a-z][a-z\s'-]{2,60}?)(?=[.,!\n]|$)/i,
];

export function extractProfession(text: string): string | null {
  for (const pattern of PROFESSION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}
