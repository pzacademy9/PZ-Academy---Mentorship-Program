/**
 * Pure logic behind the in-place contact picker in SegmentBuilder. No I/O,
 * safe for client components.
 */

/** Mirrors the contact_id `.max(500)` in segmentFilterSchema (validations/crm.ts). */
export const MAX_PICKED_CONTACTS = 500;

export type PickerContact = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  unsubscribed: boolean;
};

/** Appends new ids, dropping duplicates and anything beyond the cap. */
export function mergeContactIds(existing: string[], incoming: string[], cap: number = MAX_PICKED_CONTACTS): string[] {
  const out = Array.from(new Set(existing));
  const seen = new Set(out);
  for (const id of incoming) {
    if (out.length >= cap) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Why a contact would be dropped by the channel's send guard, or null when
 * they look reachable. Email: no address or unsubscribed. WhatsApp: only the
 * missing phone is knowable from the list row (WhatsApp opt-out is not in it).
 * Bounced/suppressed addresses cannot be known here.
 */
export function contactSendFlag(
  contact: PickerContact,
  channel: "email" | "whatsapp",
): "no email" | "unsubscribed" | "no phone" | null {
  if (channel === "whatsapp") return contact.phoneE164 ? null : "no phone";
  if (!contact.email) return "no email";
  if (contact.unsubscribed) return "unsubscribed";
  return null;
}
