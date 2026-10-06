import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { TodayQueue } from "@/components/sales/TodayQueue";
import { getAgentsCanClaim } from "@/lib/data/sales-assignment";
import { firstNameOf } from "@/lib/crm/whatsapp-link";
import { DEFAULT_SETTINGS, localParts } from "@/lib/crm/send-limits";
import { greetingFor } from "@/lib/crm/sales-ui";

export const metadata = { title: "Today — Sales Workspace" };

export default async function SalesWorkspacePage() {
  const { user, supabase, role } = await requireSalesAgentPage();
  const [{ data: profile }, canClaim] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    // Admins are exempt from the claim setting server-side, so their UI always offers Claim.
    role === "admin" || role === "super_admin" ? Promise.resolve(true) : getAgentsCanClaim(),
  ]);
  const greeting = greetingFor(localParts(new Date(), DEFAULT_SETTINGS.timezone).hour);
  return <TodayQueue greeting={greeting} firstName={firstNameOf(profile?.full_name ?? "")} canClaim={canClaim} />;
}
