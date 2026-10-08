"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { CampaignListItemJson } from "@/lib/crm/campaign-ui";

const NEW_HREF = "/dashboard/sales/campaigns/new";

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  active: { text: "Active", cls: "bg-pz-primary-container/30 text-pz-on-primary-container" },
  paused: { text: "Paused", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed" },
  done: { text: "Done", cls: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed" },
};

const linkCls =
  "inline-flex items-center justify-center h-12 max-md:min-h-11 px-5 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-sm transition-all shadow-sm active:scale-[0.99]";

export function CampaignsList() {
  const [items, setItems] = useState<CampaignListItemJson[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/sales/campaigns", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setItems(((await res.json()) as { campaigns: CampaignListItemJson[] }).campaigns);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (error) {
    return (
      <div role="alert" className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-3 items-start">
        <p className="text-sm text-pz-on-surface">We couldn&apos;t load your campaigns. Please try again.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="h-12 max-md:min-h-11 px-5 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm"
        >
          Retry
        </button>
      </div>
    );
  }
  if (items === null) {
    return <div role="status" aria-label="Loading your campaigns" className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Link href={NEW_HREF} className={`${linkCls} max-md:w-full`}>New campaign</Link>
      </div>

      {items.length === 0 ? (
        <section className="bg-pz-surface-container-lowest rounded-xl shadow-sm">
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet."
            description="A campaign lets you message a group of your contacts, one person at a time."
            action={{ label: "New campaign", href: NEW_HREF }}
          />
        </section>
      ) : (
        <div className="flex flex-col gap-3.5">
          {items.map((c) => {
            const chip = STATUS_CHIP[c.status] ?? STATUS_CHIP.active;
            const pct = c.recipientCount > 0 ? Math.min(100, Math.round((c.sentCount / c.recipientCount) * 100)) : 0;
            const done = c.status === "done";
            return (
              <article key={c.id} className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-headline font-bold text-pz-on-surface min-w-0 break-words">{c.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-headline font-bold shrink-0 ${chip.cls}`}>{chip.text}</span>
                </div>
                <p className="mt-2 text-xs text-pz-on-surface-variant">{c.sentCount} of {c.recipientCount} sent</p>
                <div className="mt-2 h-1.5 rounded-full bg-pz-surface-container-high overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-pz-primary" style={{ width: `${pct}%` }} />
                </div>
                {c.status === "paused" && c.pausedReason && (
                  <p className="mt-2 text-xs text-pz-secondary">{c.pausedReason}</p>
                )}
                <div className="mt-3.5">
                  <Link href={`/dashboard/sales/campaigns/${c.id}`} className={`${linkCls} max-md:w-full`}>
                    {done ? "View" : "Resume"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
