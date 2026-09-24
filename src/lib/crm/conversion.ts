/**
 * Pure conversion resolution — no I/O. The caller (the shared data-layer
 * helper in admin-crm-conversions.ts) fetches recipients and purchases and
 * calls this; this just decides which recipients converted and when.
 *
 * `recipients` must already be filtered to ones that were actually sent
 * (a real sentAt) — this function trusts that and does not defend against
 * a recipient who was never messaged; the caller owns that filter (see the
 * design doc's Review Focus item on this).
 */

export type ConversionRecipient = { contactId: string; sentAt: string };

export type ConversionPurchase = {
  contactId: string;
  purchasedAt: string | null; // falls back to createdAt when null
  createdAt: string;
  courseId: string | null;
  productLabel: string;
};

export type ConversionTag =
  | { kind: "course"; courseId: string }
  | { kind: "label"; pattern: string } // case-insensitive substring match against productLabel
  | { kind: "none" };

export type ConversionResult = { contactId: string; convertedAt: string | null };

const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

function matchesTag(purchase: ConversionPurchase, tag: Exclude<ConversionTag, { kind: "none" }>): boolean {
  if (tag.kind === "course") return purchase.courseId === tag.courseId;
  return purchase.productLabel.toLowerCase().includes(tag.pattern.toLowerCase());
}

export function resolveConversions(
  recipients: ConversionRecipient[],
  purchases: ConversionPurchase[],
  tag: ConversionTag,
): ConversionResult[] {
  if (tag.kind === "none") {
    return recipients.map((r) => ({ contactId: r.contactId, convertedAt: null }));
  }

  const purchasesByContact = new Map<string, ConversionPurchase[]>();
  for (const p of purchases) {
    const list = purchasesByContact.get(p.contactId);
    if (list) list.push(p);
    else purchasesByContact.set(p.contactId, [p]);
  }

  return recipients.map((r) => {
    const sentAtMs = new Date(r.sentAt).getTime();
    const windowEndMs = sentAtMs + WINDOW_MS;

    const qualifying = (purchasesByContact.get(r.contactId) ?? [])
      .filter((p) => matchesTag(p, tag))
      .map((p) => new Date(p.purchasedAt ?? p.createdAt).getTime())
      .filter((ts) => ts >= sentAtMs && ts <= windowEndMs)
      .sort((a, b) => a - b);

    return {
      contactId: r.contactId,
      convertedAt: qualifying.length > 0 ? new Date(qualifying[0]).toISOString() : null,
    };
  });
}
