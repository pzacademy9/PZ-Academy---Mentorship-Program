import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Shared message templates for both outreach channels. DB-touching
 * (createAdminSupabase) — this repo's convention is pure-function tests
 * only, no DB mocking (see mentor-reviews.test.ts). templateCreateSchema
 * in src/lib/validations/crm.ts is where the testable logic lives.
 */

export type TemplateChannel = "email" | "whatsapp";

export type TemplateRow = {
  id: string;
  channel: TemplateChannel;
  name: string;
  subject: string | null;
  body: string;
  createdAt: string;
};

export async function listTemplates(channel: TemplateChannel): Promise<TemplateRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("crm_message_templates")
    .select("id, channel, name, subject, body, created_at")
    .eq("channel", channel)
    .order("created_at", { ascending: true });

  return (data ?? []).map((t) => ({
    id: t.id,
    channel: t.channel as TemplateChannel,
    name: t.name,
    subject: t.subject,
    body: t.body,
    createdAt: t.created_at,
  }));
}

export type CreateTemplateResult = { ok: true; id: string } | { ok: false };

export async function createTemplate(
  userId: string,
  input: { channel: TemplateChannel; name: string; subject?: string; body: string },
): Promise<CreateTemplateResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("crm_message_templates")
    .insert({
      channel: input.channel,
      name: input.name,
      subject: input.subject ?? null,
      body: input.body,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[crm-templates] create failed:", error);
    return { ok: false };
  }
  return { ok: true, id: data.id };
}

export type DeleteTemplateResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function deleteTemplate(id: string): Promise<DeleteTemplateResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("crm_message_templates")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[crm-templates] delete failed:", error);
    return { ok: false, reason: "db-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}
