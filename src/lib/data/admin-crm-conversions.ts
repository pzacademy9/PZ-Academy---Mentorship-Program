import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  resolveConversions,
  type ConversionPurchase,
  type ConversionRecipient,
  type ConversionTag,
} from "@/lib/crm/conversion";

/**
 * Shared by both channels' data layers. A batch/campaign row stores its tag
 * as two nullable columns (see migration 0057) rather than the ConversionTag
 * union directly — these two functions are the single place that translates
 * between the two shapes, so nothing else needs to know the column-pair
 * convention.
 */
export function toConversionTag(courseId: string | null, labelMatch: string | null): ConversionTag {
  if (courseId !== null) return { kind: "course", courseId };
  if (labelMatch !== null) return { kind: "label", pattern: labelMatch };
  return { kind: "none" };
}

export function fromConversionTag(tag: ConversionTag): {
  conversion_course_id: string | null;
  conversion_label_match: string | null;
} {
  if (tag.kind === "course") return { conversion_course_id: tag.courseId, conversion_label_match: null };
  if (tag.kind === "label") return { conversion_course_id: null, conversion_label_match: tag.pattern };
  return { conversion_course_id: null, conversion_label_match: null };
}

export type ConversionSummary = { converted: number; total: number };
export type ConversionRecipientRow = { contactId: string; fullName: string; sentAt: string; convertedAt: string | null };

/**
 * Fetches contact_purchases for the given recipients' contacts and resolves
 * conversion. `sentRecipients` must already be filtered by the caller to
 * ones with a real sentAt (see conversion.ts's docstring) — a recipient who
 * was never actually sent to cannot be a conversion candidate, but their
 * exclusion from this list must not affect `totalAudience`, which the
 * caller passes as the full batch/campaign recipient count so the
 * percentage's denominator includes still-pending/not-yet-sent recipients.
 *
 * Caller must have already confirmed `tag.kind !== "none"` — this always
 * queries and always returns a non-null summary.
 */
export async function computeConversions(
  sentRecipients: { contactId: string; fullName: string; sentAt: string }[],
  totalAudience: number,
  tag: Exclude<ConversionTag, { kind: "none" }>,
): Promise<{ summary: ConversionSummary; recipients: ConversionRecipientRow[] }> {
  const contactIds = Array.from(new Set(sentRecipients.map((r) => r.contactId)));

  let purchases: ConversionPurchase[] = [];
  if (contactIds.length > 0) {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("contact_purchases")
      .select("contact_id, purchased_at, created_at, course_id, product_label")
      .in("contact_id", contactIds);
    purchases = (data ?? []).map((p) => ({
      contactId: p.contact_id,
      purchasedAt: p.purchased_at,
      createdAt: p.created_at,
      courseId: p.course_id,
      productLabel: p.product_label,
    }));
  }

  const forResolve: ConversionRecipient[] = sentRecipients.map((r) => ({ contactId: r.contactId, sentAt: r.sentAt }));
  const results = resolveConversions(forResolve, purchases, tag);
  const convertedAtByContact = new Map(results.map((r) => [r.contactId, r.convertedAt]));

  const recipients: ConversionRecipientRow[] = sentRecipients.map((r) => ({
    contactId: r.contactId,
    fullName: r.fullName,
    sentAt: r.sentAt,
    convertedAt: convertedAtByContact.get(r.contactId) ?? null,
  }));

  const converted = recipients.filter((r) => r.convertedAt !== null).length;
  return { summary: { converted, total: totalAudience }, recipients };
}
