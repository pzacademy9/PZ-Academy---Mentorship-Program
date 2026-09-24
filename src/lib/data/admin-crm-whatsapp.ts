import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveWhatsAppSegment } from "./admin-crm-segments";
import { reconcileWhatsAppSegment } from "@/lib/crm/whatsapp-batch-reconcile";
import type { SegmentFilter } from "@/lib/crm/segment";

/**
 * WhatsApp batch data layer. Mirrors admin-crm-import.ts / admin-crm-
 * contacts.ts conventions: service-role client, discriminated-union
 * results, no throwing.
 */

export type WhatsAppBatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
};

export async function listWhatsAppBatches(): Promise<WhatsAppBatchListRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("whatsapp_batches")
    .select("id, name, message_template, recipient_count, sent_count, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    messageTemplate: b.message_template,
    recipientCount: b.recipient_count,
    sentCount: b.sent_count,
    createdAt: b.created_at,
  }));
}

export type CreateWhatsAppBatchResult =
  | { ok: true; batchId: string; recipientCount: number }
  | { ok: false; reason: "empty-audience" | "db-error" };

/**
 * Resolves the segment against the WhatsApp reachability guard and
 * snapshots the result into whatsapp_batch_recipients. If the recipient
 * insert fails after the batch row was created, the batch row is deleted
 * rather than left behind — a batch with 0 recipients and no way to add
 * more (see spec: batches aren't editable after creation) would otherwise
 * sit in the list looking permanently broken.
 */
export async function createWhatsAppBatch(
  userId: string,
  input: { name: string; messageTemplate: string; segment: SegmentFilter[] },
): Promise<CreateWhatsAppBatchResult> {
  const resolved = await resolveWhatsAppSegment(input.segment);
  if (!resolved.ok) return { ok: false, reason: "db-error" };
  if (resolved.contacts.length === 0) return { ok: false, reason: "empty-audience" };

  const admin = createAdminSupabase();

  const { data: batch, error: batchError } = await admin
    .from("whatsapp_batches")
    .insert({
      name: input.name,
      message_template: input.messageTemplate,
      segment: input.segment,
      recipient_count: resolved.contacts.length,
      created_by: userId,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    console.error("[crm-whatsapp] batch insert failed:", batchError);
    return { ok: false, reason: "db-error" };
  }

  const { error: recipientsError } = await admin.from("whatsapp_batch_recipients").insert(
    resolved.contacts.map((c) => ({
      batch_id: batch.id,
      contact_id: c.id,
      full_name: c.fullName,
      phone_e164: c.phoneE164,
    })),
  );

  if (recipientsError) {
    console.error("[crm-whatsapp] recipient insert failed:", recipientsError);
    await admin.from("whatsapp_batches").delete().eq("id", batch.id);
    return { ok: false, reason: "db-error" };
  }

  return { ok: true, batchId: batch.id, recipientCount: resolved.contacts.length };
}

export type UpdateWhatsAppBatchResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Edits an already-created batch: name, message template, and/or segment,
 * each independently optional so a caller only sends what changed.
 *
 * A messageTemplate edit doesn't touch recipients — the link is built from
 * this field live, so a still-pending recipient just picks up the new text
 * on their next "Open chat" click. A segment edit does touch recipients:
 * it re-resolves the filter and reconciles via reconcileWhatsAppSegment
 * (newly-matching contacts added as pending, non-matching pending ones
 * removed, sent ones never touched — see that function's docs). Either
 * way, a recipient already marked sent keeps its sent_at/sent_by history.
 */
export async function updateWhatsAppBatch(
  batchId: string,
  updates: { name?: string; messageTemplate?: string; segment?: SegmentFilter[] },
): Promise<UpdateWhatsAppBatchResult> {
  const admin = createAdminSupabase();

  if (updates.segment !== undefined) {
    const resolved = await resolveWhatsAppSegment(updates.segment);
    if (!resolved.ok) return { ok: false, reason: "db-error" };

    const { data: existing, error: existingError } = await admin
      .from("whatsapp_batch_recipients")
      .select("id, contact_id, status")
      .eq("batch_id", batchId);

    if (existingError) {
      console.error("[crm-whatsapp] recipient lookup for segment re-run failed:", existingError);
      return { ok: false, reason: "db-error" };
    }

    const { toInsert, toDeleteIds } = reconcileWhatsAppSegment(
      resolved.contacts,
      (existing ?? []).map((r) => ({ id: r.id, contactId: r.contact_id, status: r.status })),
    );

    if (toInsert.length > 0) {
      const { error: insertError } = await admin.from("whatsapp_batch_recipients").insert(
        toInsert.map((c) => ({
          batch_id: batchId,
          contact_id: c.contactId,
          full_name: c.fullName,
          phone_e164: c.phoneE164,
        })),
      );
      if (insertError) {
        console.error("[crm-whatsapp] segment re-run insert failed:", insertError);
        return { ok: false, reason: "db-error" };
      }
    }

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await admin
        .from("whatsapp_batch_recipients")
        .delete()
        .in("id", toDeleteIds);
      if (deleteError) {
        console.error("[crm-whatsapp] segment re-run delete failed:", deleteError);
        return { ok: false, reason: "db-error" };
      }
    }

    const { count } = await admin
      .from("whatsapp_batch_recipients")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);

    const { data, error } = await admin
      .from("whatsapp_batches")
      .update({
        segment: updates.segment,
        recipient_count: count ?? 0,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.messageTemplate !== undefined ? { message_template: updates.messageTemplate } : {}),
      })
      .eq("id", batchId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[crm-whatsapp] batch update failed:", error);
      return { ok: false, reason: "db-error" };
    }
    if (!data) return { ok: false, reason: "not-found" };
    return { ok: true };
  }

  const { data, error } = await admin
    .from("whatsapp_batches")
    .update({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.messageTemplate !== undefined ? { message_template: updates.messageTemplate } : {}),
    })
    .eq("id", batchId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[crm-whatsapp] batch update failed:", error);
    return { ok: false, reason: "db-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };

  return { ok: true };
}

export type DeleteWhatsAppBatchResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/** whatsapp_batch_recipients cascade-deletes via its batch_id FK (0054). */
export async function deleteWhatsAppBatch(batchId: string): Promise<DeleteWhatsAppBatchResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("whatsapp_batches")
    .delete()
    .eq("id", batchId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[crm-whatsapp] batch delete failed:", error);
    return { ok: false, reason: "db-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };

  return { ok: true };
}

export type WhatsAppRecipientRow = {
  id: string;
  fullName: string;
  phoneE164: string;
  status: "pending" | "sent";
  sentAt: string | null;
};

export type WhatsAppBatchDetail = WhatsAppBatchListRow & {
  segment: SegmentFilter[];
  recipients: WhatsAppRecipientRow[];
};

export async function getWhatsAppBatchDetail(id: string): Promise<WhatsAppBatchDetail | null> {
  const admin = createAdminSupabase();
  const { data: batch } = await admin
    .from("whatsapp_batches")
    .select("id, name, message_template, segment, recipient_count, sent_count, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!batch) return null;

  const { data: recipients } = await admin
    .from("whatsapp_batch_recipients")
    .select("id, full_name, phone_e164, status, sent_at")
    .eq("batch_id", id)
    .order("full_name", { ascending: true });

  return {
    id: batch.id,
    name: batch.name,
    messageTemplate: batch.message_template,
    segment: (batch.segment ?? []) as SegmentFilter[],
    recipientCount: batch.recipient_count,
    sentCount: batch.sent_count,
    createdAt: batch.created_at,
    recipients: (recipients ?? []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phoneE164: r.phone_e164,
      status: r.status,
      sentAt: r.sent_at,
    })),
  };
}

export type UpdateRecipientStatusResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Scoped by BOTH batchId and recipientId — a recipient id that's real but
 * belongs to a different batch must 404, not silently update the wrong
 * batch's recipient and sent_count (Review Focus item 5).
 *
 * sent_count is recomputed with a COUNT query after the update rather than
 * incremented/decremented in place, so it can never drift even if this is
 * ever called concurrently or from a future bulk-status path.
 */
export async function updateRecipientStatus(
  batchId: string,
  recipientId: string,
  status: "pending" | "sent",
  userId: string,
): Promise<UpdateRecipientStatusResult> {
  const admin = createAdminSupabase();

  const { data: recipient, error: fetchError } = await admin
    .from("whatsapp_batch_recipients")
    .select("id, status")
    .eq("id", recipientId)
    .eq("batch_id", batchId)
    .maybeSingle();

  if (fetchError) {
    console.error("[crm-whatsapp] recipient lookup failed:", fetchError);
    return { ok: false, reason: "db-error" };
  }
  if (!recipient) return { ok: false, reason: "not-found" };

  if (recipient.status !== status) {
    const { error: updateError } = await admin
      .from("whatsapp_batch_recipients")
      .update({
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        sent_by: status === "sent" ? userId : null,
      })
      .eq("id", recipientId);

    if (updateError) {
      console.error("[crm-whatsapp] recipient update failed:", updateError);
      return { ok: false, reason: "db-error" };
    }

    const { count } = await admin
      .from("whatsapp_batch_recipients")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("status", "sent");

    await admin.from("whatsapp_batches").update({ sent_count: count ?? 0 }).eq("id", batchId);
  }

  return { ok: true };
}
