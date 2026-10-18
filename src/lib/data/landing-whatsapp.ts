// src/lib/data/landing-whatsapp.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { OFFICIAL_WHATSAPP, cleanWhatsappNumber } from "@/lib/landing/whatsapp";

export type SavedWhatsappNumber = { id: string; label: string; number: string; official: false };
export type WhatsappNumberRow = { label: string; number: string; official: true } | SavedWhatsappNumber;

/** The official numbers first (no id, cannot be removed), then the saved ones, oldest first. Throws on a read error. */
export async function listWhatsappNumbers(): Promise<WhatsappNumberRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_whatsapp_numbers")
    .select("id, label, number")
    .order("created_at")
    .order("id");
  if (error) throw error;
  const official: WhatsappNumberRow[] = OFFICIAL_WHATSAPP.map((n) => ({ label: n.label, number: n.number, official: true }));
  const saved: WhatsappNumberRow[] = (data ?? []).map((r) => ({ id: r.id, label: r.label, number: r.number, official: false }));
  return [...official, ...saved];
}

export async function addWhatsappNumber(
  input: { label: string; number: string },
  userId: string,
): Promise<{ ok: true; row: SavedWhatsappNumber } | { ok: false; reason: "invalid" | "duplicate" | "error" }> {
  const label = input.label.trim();
  const number = cleanWhatsappNumber(input.number);
  if (!number || label.length < 1 || label.length > 60) return { ok: false, reason: "invalid" };
  if (OFFICIAL_WHATSAPP.some((n) => n.number === number)) return { ok: false, reason: "duplicate" };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_whatsapp_numbers")
    .insert({ label, number, created_by: userId })
    .select("id, label, number")
    .single();
  if (error) return { ok: false, reason: error.code === "23505" ? "duplicate" : "error" };
  return { ok: true, row: { id: data.id, label: data.label, number: data.number, official: false } };
}

/** Removes a saved number by id. Official numbers have no id, so they can never be deleted here. */
export async function deleteWhatsappNumber(id: string): Promise<{ ok: boolean }> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("landing_whatsapp_numbers").delete().eq("id", id);
  return { ok: !error };
}
