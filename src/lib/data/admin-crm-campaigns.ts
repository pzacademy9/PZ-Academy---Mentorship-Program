import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveSegment } from "@/lib/data/admin-crm-segments";
import { renderMergeTags } from "@/lib/crm/merge-tags";
import { buildCampaignHtml } from "@/lib/crm/campaign-email";
import { sendTransactionalEmail } from "@/lib/brevo";
import type { SegmentFilter } from "@/lib/crm/segment";

/**
 * Campaign drafting and sending. Mirrors admin-marketing.ts conventions.
 *
 * Sending inserts rows into the EXISTING email_queue and lets the existing
 * process-email-queue edge function drain them. No second sender exists to
 * diverge from the first, and brevo-webhook-handler already writes opens,
 * clicks, and bounces into email_metrics — which is where crm_campaign_stats
 * reads them from.
 */

export type MutationResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" | "db-error" | "empty-segment" | "already-sent" };

export type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  status: string;
  createdAt: string;
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export async function listCampaigns(): Promise<CampaignRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("crm_campaign_stats")
    .select("campaign_id, name, status, created_at, recipients, sent, delivered, opened, clicked, bounced")
    .order("created_at", { ascending: false });

  const { data: subjects } = await admin.from("campaigns").select("id, subject");
  const subjectById = new Map((subjects ?? []).map((c) => [c.id, c.subject]));

  return (data ?? [])
    // A stats row always has these — the view types them nullable only because
    // it is a view (LEFT JOIN shape), so narrow/coalesce here.
    .filter((c): c is typeof c & { campaign_id: string } => c.campaign_id !== null)
    .map((c) => ({
      id: c.campaign_id,
      name: c.name ?? "",
      subject: subjectById.get(c.campaign_id) ?? "",
      status: c.status ?? "draft",
      createdAt: c.created_at ?? "",
      recipients: Number(c.recipients ?? 0),
      sent: Number(c.sent ?? 0),
      delivered: Number(c.delivered ?? 0),
      opened: Number(c.opened ?? 0),
      clicked: Number(c.clicked ?? 0),
      bounced: Number(c.bounced ?? 0),
    }));
}

export async function createCampaign(
  userId: string,
  input: { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[] },
): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      name: input.name,
      subject: input.subject,
      html_content: input.bodyHtml,
      segment: input.segment,
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[crm-campaigns] create failed:", error);
    return { ok: false, reason: "db-error" };
  }
  if (!data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3945";
}

/** Sends one rendered copy directly, bypassing the queue — used only for test sends. */
export async function sendTestEmail(campaignId: string, toEmail: string): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, subject, html_content")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, reason: "not-found" };

  const context = { fullName: "Test Person", email: toEmail };
  const html = buildCampaignHtml({
    bodyHtml: renderMergeTags(campaign.html_content, context),
    unsubscribeUrl: `${appUrl()}/unsubscribe/preview`,
  });

  try {
    await sendTransactionalEmail({
      to: toEmail,
      subject: `[TEST] ${renderMergeTags(campaign.subject, context)}`,
      htmlContent: html,
    });
    return { ok: true, id: campaign.id };
  } catch (error) {
    console.error("[crm-campaigns] test send failed:", error);
    return { ok: false, reason: "db-error" };
  }
}

const ENQUEUE_CHUNK = 200;

/**
 * Snapshots the segment, renders one email per contact, and enqueues them.
 *
 * The recipient list is snapshotted rather than re-resolved at drain time so
 * it cannot shift underneath a send that takes hours. UNIQUE (campaign_id,
 * contact_id) makes a retry safe: anyone already enqueued is skipped by the
 * conflict clause rather than emailed twice.
 */
export async function sendCampaign(campaignId: string): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, subject, html_content, segment, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, reason: "not-found" };
  if (campaign.status === "sent" || campaign.status === "sending") return { ok: false, reason: "already-sent" };

  const filters = (Array.isArray(campaign.segment) ? campaign.segment : []) as SegmentFilter[];
  const { contacts } = await resolveSegment(filters);
  if (contacts.length === 0) return { ok: false, reason: "empty-segment" };

  // Skip contacts already linked to this campaign, so a deliberate retry after
  // a mid-send chunk failure re-processes only the chunks that did not complete.
  const { data: existingLinks } = await admin
    .from("campaign_recipients")
    .select("contact_id")
    .eq("campaign_id", campaignId);
  const alreadyEnqueued = new Set((existingLinks ?? []).map((r) => r.contact_id));
  const pending = contacts.filter((c) => !alreadyEnqueued.has(c.id));
  if (pending.length === 0) {
    await admin
      .from("campaigns")
      .update({ status: "sent", completed_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { ok: true, id: campaignId };
  }

  await admin.from("campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", campaignId);

  const nowMinute = new Date().toISOString().slice(0, 16);

  for (let i = 0; i < pending.length; i += ENQUEUE_CHUNK) {
    const chunk = pending.slice(i, i + ENQUEUE_CHUNK);

    const queueRows = chunk.map((contact) => ({
      event_type: "campaign",
      user_email: contact.email,
      subject: renderMergeTags(campaign.subject, contact),
      html_content: buildCampaignHtml({
        bodyHtml: renderMergeTags(campaign.html_content, contact),
        unsubscribeUrl: `${appUrl()}/unsubscribe/${contact.unsubscribeToken}`,
      }),
      status: "pending",
      created_minute: nowMinute,
    }));

    const { data: queued, error: queueError } = await admin.from("email_queue").insert(queueRows).select("id, user_email");
    if (queueError) {
      // Leave status 'sending', not 'draft': the already-sent guard then
      // blocks an accidental re-send. Chunks already enqueued still deliver;
      // resuming the rest needs a deliberate reset to 'draft'.
      console.error("[crm-campaigns] enqueue failed:", queueError);
      return { ok: false, reason: "db-error" };
    }

    const queueIdByEmail = new Map((queued ?? []).map((q) => [q.user_email, q.id]));
    const recipientRows = chunk.map((contact) => ({
      campaign_id: campaignId,
      contact_id: contact.id,
      email_queue_id: queueIdByEmail.get(contact.email) ?? null,
      status: "queued",
    }));

    // onConflict ignore: a retried send never double-enqueues a contact.
    const { error: recipientError } = await admin
      .from("campaign_recipients")
      .upsert(recipientRows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
    if (recipientError) {
      // Residual sharp edge: email_queue.insert for this chunk succeeded, so
      // those contacts are queued but not recorded here. A forced retry (after
      // manually resetting status to 'draft') would re-enqueue them — that
      // path needs manual email_queue cleanup first. Rare double-failure.
      console.error("[crm-campaigns] recipient link failed:", recipientError);
      return { ok: false, reason: "db-error" };
    }
  }

  await admin
    .from("campaigns")
    .update({ status: "sent", completed_at: new Date().toISOString() })
    .eq("id", campaignId);

  return { ok: true, id: campaignId };
}
