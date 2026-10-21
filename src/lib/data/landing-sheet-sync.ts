import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { RegistrationStatus } from "@/lib/landing/registration/config";

export interface SnapshotInput { id: string; status: RegistrationStatus; amountReceived: number | null; name: string; email: string; whatsapp: string }
export interface StatusSnapshotInput { id: string; status: RegistrationStatus; amountReceived: number | null }

/**
 * Remembers what the app last wrote to each sheet row. Values are stored in the form the planner
 * compares with (email lower+trim, WhatsApp digits only, name trimmed). Throws on a database error.
 */
export async function saveSnapshots(regs: SnapshotInput[]): Promise<void> {
  if (regs.length === 0) return;
  const now = new Date().toISOString();
  const rows = regs.map((r) => ({
    registration_id: r.id,
    status: r.status,
    amount_received: r.amountReceived,
    name: r.name.trim(),
    email: r.email.trim().toLowerCase(),
    whatsapp: r.whatsapp.replace(/\D/g, ""),
    updated_at: now,
  }));
  const { error } = await createAdminSupabase().from("landing_sheet_snapshots").upsert(rows, { onConflict: "registration_id" });
  if (error) throw new Error(error.message);
}

/**
 * After a status push: updates ONLY status and amount of snapshots that already exist, so the stored
 * name/email/WhatsApp stay as last written. Registrations without a snapshot are skipped (they get
 * one at their first approved scan). Throws on a database error.
 */
export async function saveStatusSnapshots(regs: StatusSnapshotInput[]): Promise<void> {
  const now = new Date().toISOString();
  const db = createAdminSupabase();
  for (const r of regs) {
    const { error } = await db
      .from("landing_sheet_snapshots")
      .update({ status: r.status, amount_received: r.amountReceived, updated_at: now })
      .eq("registration_id", r.id);
    if (error) throw new Error(error.message);
  }
}
