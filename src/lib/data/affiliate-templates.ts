// src/lib/data/affiliate-templates.ts
// Saved message templates the admin can use when contacting affiliates (service role).
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type AffiliateTemplate = {
  id: string;
  channel: "whatsapp" | "email";
  name: string;
  subject: string | null;
  body: string;
};

export async function listAffiliateTemplates(channel?: "whatsapp" | "email"): Promise<AffiliateTemplate[]> {
  let q = createAdminSupabase()
    .from("affiliate_message_templates")
    .select("id, channel, name, subject, body, sort_order")
    .order("sort_order", { ascending: true });
  if (channel) q = q.eq("channel", channel);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    channel: r.channel as "whatsapp" | "email",
    name: r.name,
    subject: r.subject,
    body: r.body,
  }));
}
