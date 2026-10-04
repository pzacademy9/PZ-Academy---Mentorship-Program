export type CarryOverSource = {
  do_not_contact_at: string | null;
  whatsapp_unsubscribed_at: string | null;
  owner_id: string | null;
  claimed_at: string | null;
};

export type CarryOverPatch = Partial<CarryOverSource>;

function earliest(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/**
 * Compliance and ownership fields that must survive a duplicate merge.
 * Opt-out timestamps: the EARLIEST non-null wins (never lose a stop request,
 * never push an opt-out later). Owner and claimed_at are copied from the
 * merged-away contact only when the kept contact has no owner. Returns only
 * the fields that actually change on `kept`.
 */
export function carryOverFields(kept: CarryOverSource, merged: CarryOverSource): CarryOverPatch {
  const patch: CarryOverPatch = {};

  const dnc = earliest(kept.do_not_contact_at, merged.do_not_contact_at);
  if (dnc !== kept.do_not_contact_at) patch.do_not_contact_at = dnc;

  const wa = earliest(kept.whatsapp_unsubscribed_at, merged.whatsapp_unsubscribed_at);
  if (wa !== kept.whatsapp_unsubscribed_at) patch.whatsapp_unsubscribed_at = wa;

  if (kept.owner_id == null && merged.owner_id != null) {
    patch.owner_id = merged.owner_id;
    patch.claimed_at = merged.claimed_at;
  }

  return patch;
}
