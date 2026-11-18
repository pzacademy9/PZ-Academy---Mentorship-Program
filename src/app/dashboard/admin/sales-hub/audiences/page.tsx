import { requireAdminPage } from "@/lib/auth/require-admin";
import { audienceFacets } from "@/lib/data/audience-query";
import { listSavedAudiences } from "@/lib/data/audience-saved";
import { AudiencesPanel } from "@/components/admin/crm/AudiencesPanel";

export const metadata = { title: "Audiences — Sales Hub — PZ Academy" };
export const maxDuration = 60;

export default async function SalesHubAudiencesPage() {
  await requireAdminPage("sales_hub");
  const [facets, saved] = await Promise.all([audienceFacets(), listSavedAudiences()]);
  return (
    <AudiencesPanel
      facets={facets}
      saved={saved.items}
      needsUpdate={facets.needsUpdate || saved.needsUpdate}
    />
  );
}
