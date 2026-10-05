import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canActOnContact, type Actor } from "@/lib/crm/ownership";
import { nextFollowupAfterSend } from "@/lib/crm/followup";
import { buildWhatsAppLink, renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import {
  budgetSummary,
  evaluateSend,
  outsideQuietHours,
  violationAfterInsert,
  type BlockReason,
  type BudgetSummary,
} from "@/lib/crm/send-limits";
import {
  getNumberForAgent,
  getNumberUsage,
  getSafetySettings,
  logBlockedAttempt,
  toNumberState,
} from "@/lib/data/sales-numbers";

export type SendResult =
  | {
      ok: true;
      link: string;
      nextUnlockAt: string;
      warnings: string[];
      isNewChat: boolean;
      budget: BudgetSummary;
    }
  | {
      ok: false;
      reason:
        | BlockReason
        | "not-found"
        | "not-owner"
        | "do-not-contact"
        | "no-phone"
        | "number-not-assigned"
        | "db-error";
      message?: string;
      retryAt?: string | null;
    };

/**
 * The one place a WhatsApp link is produced. Counting happens when the link is
 * requested, not when WhatsApp opens (the app cannot see inside WhatsApp), which
 * errs on the cautious side. The checks run before the insert; after it the
 * limits are re-verified and the row is removed if two taps raced.
 */
export async function requestSend(args: {
  actor: Actor;
  contactId: string;
  numberId: string;
  messageTemplate: string;
  followupInHours?: number;
  now?: Date;
  rand?: () => number;
}): Promise<SendResult> {
  const { actor, contactId, numberId, messageTemplate, followupInHours } = args;
  const now = args.now ?? new Date();
  const rand = args.rand ?? Math.random;
  try {
    const db = createAdminSupabase();

    const { data: contact, error } = await db
      .from("contacts")
      .select("id, full_name, phone_e164, owner_id, do_not_contact_at, whatsapp_unsubscribed_at")
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw error;
    if (!contact) return { ok: false, reason: "not-found" };

    if (!canActOnContact({ owner_id: contact.owner_id }, actor).ok) return { ok: false, reason: "not-owner" };
    if (contact.do_not_contact_at || contact.whatsapp_unsubscribed_at) {
      return { ok: false, reason: "do-not-contact" };
    }
    if (!contact.phone_e164) return { ok: false, reason: "no-phone" };

    const isAdmin = actor.role === "admin" || actor.role === "super_admin";
    const number = await getNumberForAgent(actor.id, isAdmin, numberId);
    if (!number) return { ok: false, reason: "number-not-assigned" };

    const settings = await getSafetySettings();
    const state = toNumberState(number);

    // A "new chat" is a contact with no two-way history yet.
    const { data: twoWay, error: twErr } = await db
      .from("contact_activities")
      .select("id")
      .eq("contact_id", contactId)
      .in("kind", ["replied", "interested", "bought"])
      .limit(1);
    if (twErr) throw twErr;
    const isNewChat = (twoWay ?? []).length === 0;

    const usage = await getNumberUsage(numberId, now, settings);
    const decision = evaluateSend({ now, settings, state, usage, isNewChat, rand });
    if (!decision.ok) {
      await logBlockedAttempt({ numberId, agentId: actor.id, contactId, reason: decision.reason }, { now });
      return {
        ok: false,
        reason: decision.reason,
        message: decision.message,
        retryAt: decision.retryAt ? decision.retryAt.toISOString() : null,
      };
    }

    const body = renderWhatsAppMessage(messageTemplate, contact.full_name);
    const createdIso = now.toISOString();
    const { data: row, error: insErr } = await db
      .from("contact_activities")
      .insert({
        contact_id: contactId,
        agent_id: actor.id,
        kind: "sent",
        body,
        number_id: numberId,
        is_new_chat: isNewChat,
        burst_pos: decision.burstPos,
        next_unlock_at: decision.nextUnlockAt.toISOString(),
        created_at: createdIso,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // Re-verify: catches two requests racing on a shared number. Our row is
    // stamped with the request start time, so a slower request can land after a
    // later one. We therefore look at every OTHER sent row within the minimum
    // spacing on either side of our timestamp (strict bounds), and treat the one
    // with the latest unlock time as the previous send. The later inserter always
    // sees the earlier row and rejects itself; if both insert before either
    // re-checks, both reject (fails closed).
    const after = await getNumberUsage(numberId, now, settings);
    let conflict: { created_at: string; next_unlock_at: string; burst_pos: number | null } | null = null;
    if (settings.spacing_min_s > 0) {
      const spanMs = settings.spacing_min_s * 1000;
      const { data: nearRows, error: nearErr } = await db
        .from("contact_activities")
        .select("created_at, next_unlock_at, burst_pos")
        .eq("number_id", numberId)
        .eq("kind", "sent")
        .neq("id", row.id)
        .gt("created_at", new Date(now.getTime() - spanMs).toISOString())
        .lt("created_at", new Date(now.getTime() + spanMs).toISOString());
      if (nearErr) throw nearErr;
      for (const r of nearRows ?? []) {
        if (!r.next_unlock_at) continue;
        if (!conflict || new Date(r.next_unlock_at).getTime() > new Date(conflict.next_unlock_at).getTime()) {
          conflict = { created_at: r.created_at, next_unlock_at: r.next_unlock_at, burst_pos: r.burst_pos };
        }
      }
    }
    const violation = violationAfterInsert({
      now,
      settings,
      state,
      isNewChat,
      usageWithOurs: { newChatsToday: after.newChatsToday, newChatsLastHour: after.newChatsLastHour },
      previousSend: conflict
        ? {
            createdAt: new Date(conflict.created_at),
            nextUnlockAt: new Date(conflict.next_unlock_at),
            burstPos: conflict.burst_pos ?? 1,
          }
        : null,
    });
    if (violation) {
      const { error: delErr } = await db.from("contact_activities").delete().eq("id", row.id);
      if (delErr) console.error("[sales-send] could not remove over-limit send", row.id, delErr);
      await logBlockedAttempt({ numberId, agentId: actor.id, contactId, reason: violation }, { now });
      return {
        ok: false,
        reason: violation,
        message: "Another message was just sent from this number. Try again in a moment.",
        retryAt:
          violation === "spacing" && conflict
            ? outsideQuietHours(new Date(conflict.next_unlock_at), settings).toISOString()
            : null,
      };
    }

    // The person leaves Today until the time THEY chose (plan decision D1, default 1 day).
    // A failure here must not hide a send that was already counted, so it is logged, not thrown.
    const { error: bumpErr } = await db
      .from("contacts")
      .update({ next_followup_at: nextFollowupAfterSend(now, followupInHours).toISOString() })
      .eq("id", contactId);
    if (bumpErr) console.error("[sales-send] could not move the follow-up after a send", contactId, bumpErr);

    return {
      ok: true,
      link: buildWhatsAppLink(contact.phone_e164, messageTemplate, contact.full_name),
      nextUnlockAt: outsideQuietHours(decision.nextUnlockAt, settings).toISOString(),
      warnings: decision.warnings,
      isNewChat,
      budget: budgetSummary({ now, settings, state, usage: after }),
    };
  } catch (e) {
    console.error("[sales-send] requestSend", e);
    return { ok: false, reason: "db-error" };
  }
}
