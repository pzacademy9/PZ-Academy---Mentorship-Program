/**
 * Click-to-chat link generation for the WhatsApp outreach feature.
 * Pure — no I/O, no database, safe to import from client components (the
 * recipient table builds these links directly in the browser).
 */

/** First whitespace-separated token of a full name; the whole name if there is no space. */
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return "";
  return trimmed.split(/\s+/)[0];
}

/**
 * Same tag matching and blank-name fallback as the email channel's
 * src/lib/crm/merge-tags.ts ("there" keeps a greeting grammatical when the
 * sheet had no name; {{ first_name }} with stray whitespace still matches),
 * so the two channels behave identically for the same contact data. Not
 * reusing renderMergeTags directly — it HTML-escapes for email body markup,
 * which would corrupt a plain-text wa.me message (e.g. turn "&" into
 * "&amp;" in what the admin actually sends).
 */
function renderMessage(template: string, fullName: string): string {
  const trimmedName = fullName.trim();
  const first = firstNameOf(fullName);
  const values: Record<string, string> = {
    first_name: first === "" ? "there" : first,
    full_name: trimmedName === "" ? "there" : trimmedName,
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : value;
  });
}

/**
 * Links straight to web.whatsapp.com/send rather than wa.me: wa.me is only
 * a redirector that shows an interstitial ("Open app" / "Continue to
 * WhatsApp Web") on every click, which is an extra click per recipient in
 * a batch of dozens. web.whatsapp.com/send goes directly into the web
 * client an already-logged-in admin has open, same as wa.me's own
 * "Continue to WhatsApp Web" destination minus the interstitial.
 *
 * Digits-only, no leading "+", no spaces or dashes. phoneE164 is always
 * "+<country><number>" by construction (src/lib/crm/phone.ts's
 * normalizePhone), so stripping every non-digit character is a defensive
 * superset of "just remove the +".
 */
export function buildWhatsAppLink(phoneE164: string, messageTemplate: string, fullName: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  const message = renderMessage(messageTemplate, fullName);
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}
