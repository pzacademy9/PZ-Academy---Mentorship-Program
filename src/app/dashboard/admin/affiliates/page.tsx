import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAffiliates } from "@/lib/data/affiliates";
import { affiliatesWithFailedEmail } from "@/lib/data/affiliate-emails";
import { AffiliatesAdmin } from "@/components/admin/affiliates/AffiliatesAdmin";

export const metadata = { title: "Affiliates — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminAffiliatesPage() {
  await requireAdminPage("sales_hub");
  const [rows, failed] = await Promise.all([listAffiliates(), affiliatesWithFailedEmail()]);

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-pz-secondary">Affiliates</h1>
        <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
          Read each application, then accept or drop it. Accepted affiliates get their code and private link by email.
        </p>
      </div>
      <AffiliatesAdmin initial={rows} emailFailedIds={Array.from(failed)} />
    </div>
  );
}
