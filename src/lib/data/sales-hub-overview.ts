import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { HubOverview } from "@/lib/crm/sales-hub-overview";

export async function getSalesHubOverview(): Promise<HubOverview> {
  const db = createAdminSupabase();
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };
  const [contactsTotal, unassigned, activeAgents, frozenNumbers] = await Promise.all([
    count(db.from("contacts").select("id", { count: "exact", head: true })),
    count(db.from("contacts").select("id", { count: "exact", head: true }).is("owner_id", null)),
    count(db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "sales_agent")),
    count(db.from("whatsapp_numbers").select("id", { count: "exact", head: true }).eq("status", "frozen")),
  ]);
  return { contactsTotal, unassigned, activeAgents, frozenNumbers };
}
