import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCohorts } from "@/lib/data/admin-crm-import";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { listAgentAssignmentCounts } from "@/lib/data/sales-assignment";
import { AssignListsPanel } from "@/components/admin/sales/AssignListsPanel";

export const metadata = { title: "Assign Lists — PZ Academy" };

export default async function AdminAssignListsPage() {
  await requireAdminPage();
  const [cohorts, agents, counts] = await Promise.all([
    listCohorts(),
    listSalesAgents(),
    listAgentAssignmentCounts(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Assign Lists</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Give an imported list or hand-picked contacts to one sales agent. They will find them in My Contacts and Today.
        </p>
      </div>
      <AssignListsPanel
        cohorts={cohorts.map((c) => ({ id: c.id, sheetName: c.sheetName, tabName: c.tabName, purchaseCount: c.purchaseCount }))}
        agents={agents.map((a) => ({ id: a.id, fullName: a.fullName }))}
        counts={counts}
      />
    </div>
  );
}
