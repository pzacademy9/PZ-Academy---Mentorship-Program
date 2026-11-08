// src/lib/data/affiliate-credit.ts
// Finds the affiliate behind a ?ref= code and writes the credit on a registration.
// Attribution must never block a registration: nothing here throws.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Affiliate codes are 1 to 3 letters then 1 to 4 digits (AS47, RAS12). Anything else is never looked up.
const CODE_RE = /^[A-Z0-9_-]{2,40}$/;

/** Only an accepted affiliate: a dropped or left one gives no credit any more. */
export async function resolveAffiliateCode(raw: string): Promise<{ affiliateId: string } | null> {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (!CODE_RE.test(code)) return null;
  try {
    const { data, error } = await createAdminSupabase()
      .from("affiliates")
      .select("id")
      .eq("code", code)
      .eq("status", "accepted")
      .maybeSingle();
    if (error || !data) return null;
    return { affiliateId: data.id };
  } catch {
    return null;
  }
}

/**
 * Marks the lead (or individual) registration as this affiliate's, unless an agent already has it.
 * Re-checks that the affiliate is still accepted: a code left switched on by mistake earns nothing.
 */
export async function creditRegistration(registrationId: string, affiliateId: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data: affiliate } = await admin.from("affiliates").select("status").eq("id", affiliateId).maybeSingle();
    if (affiliate?.status !== "accepted") return;
    const { error } = await admin
      .from("landing_registrations")
      .update({ affiliate_id: affiliateId })
      .eq("id", registrationId)
      .is("agent_id", null);
    if (error) console.warn("[affiliate-credit] credit failed:", error.code);
  } catch {
    console.warn("[affiliate-credit] credit crashed");
  }
}
