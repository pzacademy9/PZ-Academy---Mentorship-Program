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
export function renderWhatsAppMessage(template: string, fullName: string): string {
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
 * Uses the whatsapp:// app protocol (Meta's documented click-to-chat
 * scheme) rather than wa.me or web.whatsapp.com. The OS hands the link
 * straight to the installed WhatsApp desktop/mobile app — no browser tab
 * involved at all, so there's nothing to pile up across clicks, and no
 * wa.me interstitial ("Open app" / "Continue to WhatsApp Web") either.
 * The app is single-instance by nature: repeat clicks just bring the same
 * already-running window to front and swap its open chat, which is what
 * the previous wa.me/web.whatsapp.com attempts at forcing tab reuse were
 * trying (and failing) to achieve at the browser-tab level — WhatsApp
 * Web's own Cross-Origin-Opener-Policy header actively defeats any
 * client-side trick to hold onto a browser tab reference across a
 * cross-origin navigation, confirmed live. The app has no such
 * restriction because there's no browser tab to lose.
 *
 * Requires the WhatsApp desktop/mobile app to be installed and its
 * protocol handler registered with the OS — true for this CRM's admin
 * operator. Chrome will prompt to confirm opening an external app on the
 * first click from this origin; that's a one-time browser permission,
 * not a per-click step.
 *
 * Digits-only, no leading "+", no spaces or dashes. phoneE164 is always
 * "+<country><number>" by construction (src/lib/crm/phone.ts's
 * normalizePhone), so stripping every non-digit character is a defensive
 * superset of "just remove the +".
 */
export function buildWhatsAppLink(phoneE164: string, messageTemplate: string, fullName: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  const message = renderWhatsAppMessage(messageTemplate, fullName);
  return `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`;
}
