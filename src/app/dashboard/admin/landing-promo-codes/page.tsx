import { requireAdminPage } from "@/lib/auth/require-admin";
import { listPromoCodes } from "@/lib/data/landing-promo-codes";
import { getLandingPage, listLandingPages } from "@/lib/data/landing-pages";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { PromoCodesManager } from "@/components/admin/landing/promo/PromoCodesManager";
import { AgentLinksPanel } from "@/components/admin/landing/promo/AgentLinksPanel";
import type { AgentChoice, LinkPage, PromoPageOption } from "@/lib/landing/registration/promo-form";

export const metadata = { title: "Promo Codes — PZ Academy" };

export default async function AdminPromoCodesPage() {
  await requireAdminPage();
  const [codes, summaries, salesAgents] = await Promise.all([listPromoCodes(), listLandingPages(), listSalesAgents()]);
  // Option names come from each page's draft registration settings (what admins edit);
  // getLandingPage runs normalizeContent, so draft.registration is always present (Task 2).
  const full = await Promise.all(summaries.map((s) => getLandingPage(s.id)));
  const pages: PromoPageOption[] = full.flatMap((p) =>
    p ? [{ id: p.id, title: p.title, options: p.draft.registration.options.map((o) => ({ key: o.key, label: o.label })) }] : [],
  );
  const agents: AgentChoice[] = salesAgents.map((a) => ({ id: a.id, name: a.fullName || a.email || "Unnamed agent" }));
  const linkPages: LinkPage[] = summaries.filter((s) => s.status === "published").map((s) => ({ slug: s.slug, title: s.title }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Promo Codes</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Discount codes for the registration form on your landing pages. The server checks every code, so a made-up code never gives a discount.
        </p>
      </div>
      <PromoCodesManager codes={codes} pages={pages} />
      <AgentLinksPanel agents={agents} pages={linkPages} />
    </div>
  );
}
