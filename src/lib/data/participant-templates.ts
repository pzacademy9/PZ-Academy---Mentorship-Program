import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const TABLE = "participant_templates";
const COLS = "id, name, subject, email_body, whatsapp_body, updated_at";

export type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  emailBody: string;
  whatsappBody: string;
  updatedAt: string;
};

type DbRow = { id: string; name: string; subject: string; email_body: string; whatsapp_body: string; updated_at: string };

function toRow(r: DbRow): TemplateRow {
  return { id: r.id, name: r.name, subject: r.subject, emailBody: r.email_body, whatsappBody: r.whatsapp_body, updatedAt: r.updated_at };
}

/** All templates, sorted by name (case-insensitive). Templates are few; the limit is explicit. */
export async function listTemplates(): Promise<TemplateRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from(TABLE).select(COLS).order("name").limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[])
    .map(toRow)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Insert (no id) or update (with id). A blank name is refused. */
export async function saveTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  emailBody: string;
  whatsappBody: string;
  actorId: string;
}): Promise<TemplateRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the template a name");
  const admin = createAdminSupabase();
  const fields = { name, subject: input.subject, email_body: input.emailBody, whatsapp_body: input.whatsappBody };
  const q = input.id
    ? admin.from(TABLE).update({ ...fields, updated_at: new Date().toISOString() }).eq("id", input.id)
    : admin.from(TABLE).insert({ ...fields, created_by: input.actorId });
  const { data, error } = await q.select(COLS).single();
  if (error || !data) throw new Error(error?.message ?? "Template not saved");
  return toRow(data as DbRow);
}

/** Deleting a missing id is a no-op. Past sends keep their record (template_id is set null). */
export async function deleteTemplate(id: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
