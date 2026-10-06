import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCohorts } from "@/lib/data/admin-crm-import";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";

export const metadata = { title: "Cohorts — Sales Hub — PZ Academy" };

export default async function SalesHubCohortsPage() {
  await requireAdminPage();
  const cohorts = await listCohorts();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Cohorts</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Group contacts by course and intake.</p>
      </div>
      <CohortsPanel initialCohorts={cohorts} />
    </div>
  );
}
