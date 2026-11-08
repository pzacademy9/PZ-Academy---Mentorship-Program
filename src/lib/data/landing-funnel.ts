// src/lib/data/landing-funnel.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { cleanUtm } from "@/lib/landing/registration/utm";

export type FunnelEventType = "view" | "start" | "step" | "submit";

/** Best-effort analytics write. Never throws and never logs the payload. */
export async function recordFunnelEvent(e: {
  pageId: string;
  sessionId: string;
  type: FunnelEventType;
  utm: Record<string, string>;
  agentId: string | null;
  affiliateId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { error } = await admin.from("landing_funnel_events").insert({
      page_id: e.pageId,
      session_id: e.sessionId,
      type: e.type,
      utm: cleanUtm(e.utm) as unknown as Json,
      agent_id: e.agentId,
      // Only sent when there is one, so a view still records if the code is deployed before migration 0109.
      ...(e.affiliateId ? { affiliate_id: e.affiliateId } : {}),
    });
    if (error) console.warn("[landing-funnel] insert failed:", error.code);
  } catch {
    console.warn("[landing-funnel] insert crashed");
  }
}
