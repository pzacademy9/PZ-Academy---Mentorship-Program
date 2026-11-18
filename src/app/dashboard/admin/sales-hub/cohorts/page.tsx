import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCohorts } from "@/lib/data/admin-crm-import";
import { CohortsTabs } from "@/components/admin/crm/CohortsTabs";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";

export const metadata = { title: "Cohorts — Sales Hub — PZ Academy" };

export default async function SalesHubCohortsPage() {
  await requireAdminPage("sales_hub");
  const cohorts = await listCohorts();
  return (
    <div className="space-y-6">
      <CohortsTabs active="cohorts" />
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Cohorts</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Each imported sheet becomes a cohort. Pick the ones you want, then download them for Meta.</p>
      </div>
      <CohortsPanel initialCohorts={cohorts} />
    </div>
  );
}
