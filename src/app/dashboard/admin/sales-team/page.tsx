import { requireAdminPage } from "@/lib/auth/require-admin";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { SalesTeamPanel } from "@/components/admin/sales/SalesTeamPanel";

export const metadata = { title: "Sales Team — PZ Academy" };

export default async function AdminSalesTeamPage() {
  await requireAdminPage();
  const agents = await listSalesAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Sales Team</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Add the people who work contacts in the Sales Workspace. They see only that workspace, nothing else.
        </p>
      </div>
      <SalesTeamPanel agents={agents} />
    </div>
  );
}
