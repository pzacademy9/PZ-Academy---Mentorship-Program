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
  // Registration-confirmation style paste: "Name: Mahnoor Bhatti" or the Meta
  // lead-ad-generated "Full name: Mahnoor Bhatti" (its field label verbatim),
  // on its own line.
  /^\s*(?:full\s+)?name\s*[:\-]\s*([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3})\s*$/im,
  /\b(?:my\s+name\s+is|[Ii]\s*'?\s*m|[Ii]\s+am|[Tt]his\s+is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/,
  // Bare name as the very first line (common when an agent pastes a contact's own
  // WhatsApp intro, which is just their name with nothing else on that line).
  /^\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,2})\s*(?:\r?\n|$)/,
];

export function extractName(text: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

const PROFESSION_PATTERNS = [
  // Registration-confirmation style paste: "Profession: Community Pharmacist".
  /^\s*profession\s*[:\-]\s*([A-Za-z][A-Za-z\s'-]{1,60}?)\s*$/im,
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
