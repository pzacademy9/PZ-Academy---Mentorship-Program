/**
 * Pure set-diff for re-applying a WhatsApp batch's segment after it's
 * edited. No I/O — the caller (admin-crm-whatsapp.ts) resolves the segment
 * and loads current recipients, this just decides what changes.
 */

export type ReconcileMatchedContact = { id: string; fullName: string; phoneE164: string };
export type ReconcileExistingRecipient = { id: string; contactId: string | null; status: "pending" | "sent" };

export type WhatsAppSegmentReconciliation = {
  toInsert: { contactId: string; fullName: string; phoneE164: string }[];
  toDeleteIds: string[];
};

/**
 * A sent recipient is never deleted, even if their contact no longer
 * matches the re-applied segment — send history isn't something a filter
 * change should be able to erase. Only pending recipients whose contact
 * fell out of the segment are removed; a recipient with no contact_id
 * (shouldn't happen for batches created going forward, but defensive) is
 * left alone either way, since there's nothing to re-match it against.
 */
export function reconcileWhatsAppSegment(
  matchedContacts: ReconcileMatchedContact[],
  existingRecipients: ReconcileExistingRecipient[],
): WhatsAppSegmentReconciliation {
  const matchedIds = new Set(matchedContacts.map((c) => c.id));
  const existingContactIds = new Set(
    existingRecipients.filter((r) => r.contactId !== null).map((r) => r.contactId),
  );

  const toInsert = matchedContacts
    .filter((c) => !existingContactIds.has(c.id))
    .map((c) => ({ contactId: c.id, fullName: c.fullName, phoneE164: c.phoneE164 }));

  const toDeleteIds = existingRecipients
    .filter((r) => r.status === "pending" && r.contactId !== null && !matchedIds.has(r.contactId))
    .map((r) => r.id);

  return { toInsert, toDeleteIds };
}
