import { requireAdminPage } from "@/lib/auth/require-admin";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { SafetyLimitsPanel } from "@/components/admin/sales/SafetyLimitsPanel";

export const metadata = { title: "WhatsApp Safety & Limits — PZ Academy" };

export default async function AdminSalesSafetyPage() {
  await requireAdminPage();
  const agents = await listSalesAgents();
  return (
    <div className="space-y-6 font-body">
      <div>
        <h1 className="font-headline font-bold text-2xl md:text-3xl text-pz-on-surface tracking-tight">WhatsApp Safety & Limits</h1>
        <p className="text-pz-on-surface-variant text-sm md:text-base mt-1 max-w-2xl">Set how fast agents may start new chats, per WhatsApp number.</p>
      </div>
      <SafetyLimitsPanel agents={agents.map((a) => ({ id: a.id, fullName: a.fullName || a.email }))} />
    </div>
  );
}
