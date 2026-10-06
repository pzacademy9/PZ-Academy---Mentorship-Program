import { requireAdminPage } from "@/lib/auth/require-admin";
import { listMergeCandidates } from "@/lib/data/admin-crm-contacts";
import { MergeReviewPanel } from "@/components/admin/crm/MergeReviewPanel";

export const metadata = { title: "Merge Review — Sales Hub — PZ Academy" };

export default async function SalesHubMergePage() {
  await requireAdminPage();
  const mergeCandidates = await listMergeCandidates();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Merge Review</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Resolve duplicate contacts.</p>
      </div>
      <MergeReviewPanel initialCandidates={mergeCandidates} />
    </div>
  );
}
