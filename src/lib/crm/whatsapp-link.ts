/**
 * wa.me click-to-chat link generation for the WhatsApp outreach feature.
 * Pure — no I/O, no database, safe to import from client components (the
 * recipient table builds these links directly in the browser).
 */

const MERGE_TAGS: ReadonlyArray<{ tag: string; resolve: (fullName: string) => string }> = [
  { tag: "{{first_name}}", resolve: firstNameOf },
  { tag: "{{full_name}}", resolve: (fullName) => fullName },
];

/** First whitespace-separated token of a full name; the whole name if there is no space. */
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return "";
  return trimmed.split(/\s+/)[0];
}

function renderMessage(template: string, fullName: string): string {
  let out = template;
  for (const { tag, resolve } of MERGE_TAGS) out = out.split(tag).join(resolve(fullName));
  return out;
}

/**
 * wa.me requires digits only in the URL — no leading "+", no spaces or
 * dashes. phoneE164 is always "+<country><number>" by construction
 * (src/lib/crm/phone.ts's normalizePhone), so stripping every non-digit
 * character is a defensive superset of "just remove the +".
 */
export function buildWhatsAppLink(phoneE164: string, messageTemplate: string, fullName: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  const message = renderMessage(messageTemplate, fullName);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
