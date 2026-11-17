import { currentUserMayAccess, requireAdminPage } from "@/lib/auth/require-admin";
import { getPromoSettings, listPromoCodes } from "@/lib/data/landing-promo-codes";
import { getLandingPage, listLandingPages } from "@/lib/data/landing-pages";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { listAffiliates } from "@/lib/data/affiliates";
import { PromoCodesManager } from "@/components/admin/landing/promo/PromoCodesManager";
import { AgentLinksPanel } from "@/components/admin/landing/promo/AgentLinksPanel";
import type { AgentChoice, LinkPage, PromoPageOption } from "@/lib/landing/registration/promo-form";

export const metadata = { title: "Promo Codes — PZ Academy" };

export default async function AdminPromoCodesPage() {
  await requireAdminPage("landing_pages");
  // Agent links belong to Sales Hub (their route says so), so only show them to someone who has it.
  const canMakeLinks = await currentUserMayAccess("sales_hub");
  const [codes, summaries, salesAgents, affiliateRows, settings] = await Promise.all([
    listPromoCodes(), listLandingPages(), canMakeLinks ? listSalesAgents() : Promise.resolve([]),
    canMakeLinks ? listAffiliates() : Promise.resolve([]), getPromoSettings(),
  ]);
  // Option names come from each page's draft registration settings (what admins edit);
  // getLandingPage runs normalizeContent, so draft.registration is always present (Task 2).
  const full = await Promise.all(summaries.map((s) => getLandingPage(s.id)));
  const pages: PromoPageOption[] = full.flatMap((p) =>
    p ? [{ id: p.id, title: p.title, options: p.draft.registration.options.map((o) => ({ key: o.key, label: o.label })) }] : [],
  );
  const agents: AgentChoice[] = salesAgents.map((a) => ({ id: a.id, name: a.fullName || a.email || "Unnamed agent" }));
  // Names for the PDF files only: never an email, because these files get shared in groups. Empty without Sales Hub.
  const downloadAgents = salesAgents.map((a) => ({ id: a.id, name: a.fullName.trim() || "Unnamed agent" }));
  const affiliates = affiliateRows.map((a) => ({ id: a.id, name: a.name.trim() || "Unnamed affiliate" }));
  const linkPages: LinkPage[] = summaries.filter((s) => s.status === "published").map((s) => ({ slug: s.slug, title: s.title }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Promo Codes</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Discount codes for the registration form on your landing pages. The server checks every code, so a made-up code never gives a discount.
        </p>
      </div>
      <PromoCodesManager codes={codes} pages={pages} agents={agents} maxPercent={settings.maxPercent} downloadAgents={downloadAgents} affiliates={affiliates} canDownloadPeople={canMakeLinks} />
      {canMakeLinks && <AgentLinksPanel agents={agents} pages={linkPages} />}
    </div>
  );
}
