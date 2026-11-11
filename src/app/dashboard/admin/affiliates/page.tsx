import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAffiliates } from "@/lib/data/affiliates";
import { affiliatesWithFailedEmail } from "@/lib/data/affiliate-emails";
import { getAffiliateBoard, getBoardToken } from "@/lib/data/affiliate-leaderboard";
import { AffiliatesAdmin } from "@/components/admin/affiliates/AffiliatesAdmin";

export const metadata = { title: "Affiliates — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminAffiliatesPage() {
  await requireAdminPage("sales_hub");
  const [rows, failed] = await Promise.all([listAffiliates(), affiliatesWithFailedEmail()]);
  // The leaderboard is an extra tab: if it cannot load, the other two tabs must still work.
  const [month, all, token] = await Promise.all([
    getAffiliateBoard("month").catch(() => null),
    getAffiliateBoard("all").catch(() => null),
    getBoardToken().catch(() => null),
  ]);
  const boards = month && all ? { month, all } : null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
  const boardUrl = token ? `${base}/affiliate-board/${token}` : null;

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-pz-secondary">Affiliates</h1>
        <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
          Read each application, then accept or drop it. Accepted affiliates get their code and private link by email.
        </p>
      </div>
      <AffiliatesAdmin initial={rows} emailFailedIds={Array.from(failed)} boards={boards} boardUrl={boardUrl} />
    </div>
  );
}
