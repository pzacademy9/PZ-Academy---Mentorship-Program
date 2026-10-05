import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { getSafetySettings } from "@/lib/data/sales-numbers";
import { DEFAULT_SETTINGS, type SafetySettings } from "@/lib/crm/send-limits";
import { helpFaq, HONEST_NOTE, GOLDEN_RULES } from "@/lib/crm/sales-help-copy";
import { HelpFaq } from "@/components/sales/HelpFaq";
import { MyNumbersCard } from "@/components/sales/MyNumbersCard";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Help & Safety — Sales Workspace" };

export default async function SalesHelpPage() {
  await requireSalesAgentPage();
  // Display only: enforcement reads settings itself. A read failure shows the defaults.
  let settings: SafetySettings = DEFAULT_SETTINGS;
  try {
    settings = await getSafetySettings();
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  return (
    <div className="flex flex-col gap-6 font-body">
      <header>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-headline font-semibold uppercase tracking-wider text-pz-on-surface-variant">
          <span>Help &amp; Support</span>
          <span aria-hidden="true">/</span>
          <span className="text-pz-primary font-bold">WhatsApp Safety Guide</span>
        </nav>
        <h1 className="mt-3 text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">Help &amp; WhatsApp Safety</h1>
        <p className="text-sm sm:text-base text-pz-on-surface-variant mt-1">Short answers about sending limits and what to do if WhatsApp warns you.</p>
      </header>
      <div className="bg-pz-primary-container/20 rounded-xl p-4 sm:p-5 flex items-start gap-3 shadow-sm">
        <ShieldCheck className="w-6 h-6 text-pz-primary shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-headline font-bold text-pz-on-surface text-sm uppercase tracking-wider">Honest note on the limits</h2>
          <p className="text-sm sm:text-base text-pz-on-surface mt-1 leading-relaxed">{HONEST_NOTE}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8"><HelpFaq items={helpFaq(settings)} /></div>
        <aside className="lg:col-span-4 flex flex-col gap-6">
          <MyNumbersCard />
          <section className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm">
            <h2 className="font-headline font-bold text-pz-on-surface">3 golden rules</h2>
            <ol className="mt-3 flex flex-col gap-3">
              {GOLDEN_RULES.map((r, i) => (
                <li key={r.title} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-pz-primary-container text-pz-on-primary-container flex items-center justify-center text-xs font-headline font-bold shrink-0">{i + 1}</span>
                  <span><strong className="block text-sm font-headline text-pz-on-surface">{r.title}</strong><span className="text-xs text-pz-on-surface-variant">{r.body}</span></span>
                </li>
              ))}
            </ol>
          </section>
          <Link href="/dashboard/sales?tour=1" className="min-h-11 inline-flex items-center justify-center rounded-lg bg-pz-surface-container-lowest shadow-sm font-headline font-semibold text-sm text-pz-on-surface">
            Show the welcome tour again
          </Link>
        </aside>
      </div>
    </div>
  );
}
