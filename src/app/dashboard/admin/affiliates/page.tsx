import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAffiliates } from "@/lib/data/affiliates";
import { affiliatesWithFailedEmail } from "@/lib/data/affiliate-emails";
import { readEmailMessage } from "@/lib/data/affiliate-email-settings";
import { getAffiliateBoard, getBoardToken } from "@/lib/data/affiliate-leaderboard";
import { listAdminPayouts, type PayoutRow } from "@/lib/data/affiliate-payouts";
import { listAffiliateTemplates, type AffiliateTemplate } from "@/lib/data/affiliate-templates";
import { parseAffiliatesTab, tabSubtitle } from "@/lib/affiliates/hub-routes";
import { AffiliatesAdmin } from "@/components/admin/affiliates/AffiliatesAdmin";

export const metadata = { title: "Affiliates — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminAffiliatesPage({ searchParams }: { searchParams?: { tab?: string } }) {
  await requireAdminPage("sales_hub");
  const [rows, failed] = await Promise.all([listAffiliates(), affiliatesWithFailedEmail()]);
  // The leaderboard is an extra tab: if it cannot load, the other two tabs must still work.
  const [month, all, token] = await Promise.all([
    getAffiliateBoard("month").catch((e) => {
      console.error("admin affiliates: month leaderboard failed", e);
      return null;
    }),
    getAffiliateBoard("all").catch((e) => {
      console.error("admin affiliates: all-time leaderboard failed", e);
      return null;
    }),
    getBoardToken().catch((e) => {
      console.error("admin affiliates: board link failed", e);
      return null;
    }),
  ]);
  // The message box is an extra tab too: a failed read must not break the other tabs.
  let emailMessage = "";
  let emailMessageFailed = false;
  try {
    emailMessage = await readEmailMessage();
  } catch (e) {
    console.error("admin affiliates: email message failed", e);
    emailMessageFailed = true;
  }
  // Payouts are an extra tab too: a failed read must not break the other tabs.
  let payouts: PayoutRow[] = [];
  let payoutsFailed = false;
  try {
    payouts = await listAdminPayouts();
  } catch (e) {
    console.error("admin affiliates: payouts failed", e);
    payoutsFailed = true;
  }
  // The message picker is an extra tab feature too: a failed read must not break the list.
  let templates: { whatsapp: AffiliateTemplate[]; email: AffiliateTemplate[] } | null = null;
  let templatesFailed = false;
  try {
    const all = await listAffiliateTemplates();
    templates = { whatsapp: all.filter((t) => t.channel === "whatsapp"), email: all.filter((t) => t.channel === "email") };
  } catch (e) {
    console.error("admin affiliates: templates failed", e);
    templatesFailed = true;
  }
  const tab = parseAffiliatesTab(searchParams?.tab);
  const boards = month && all ? { month, all } : null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
  const boardUrl = token ? `${base}/affiliate-board/${token}` : null;

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-pz-secondary">Affiliates</h1>
        <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
          {tabSubtitle(tab)}
        </p>
      </div>
      <AffiliatesAdmin tab={tab} initial={rows} emailFailedIds={Array.from(failed)} boards={boards} boardUrl={boardUrl} emailMessage={emailMessage} emailMessageFailed={emailMessageFailed} payouts={payouts} payoutsFailed={payoutsFailed} templates={templates} templatesFailed={templatesFailed} />
    </div>
  );
}
