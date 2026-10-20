import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/lib/data/participant-campaigns";

const ALL_HREF = "/dashboard/admin/enrollments/registrations/all";
const CAMPAIGN_HREF = "/dashboard/admin/enrollments/registrations/campaign";

const PAGE_STATE: Record<Campaign["pageStatus"], { label: string; cls: string; pulse: boolean }> = {
  published: { label: "Live", cls: "bg-pz-primary-fixed text-pz-on-primary-fixed", pulse: true },
  draft: { label: "Draft", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed", pulse: false },
  closed: { label: "Closed", cls: "bg-pz-surface-container-high text-pz-on-surface-variant", pulse: false },
};

// Chip and bar colours follow the Stitch screen: pending amber, reserved green-grey, underpaid red, paid green.
const STATUS_ROWS = [
  { key: "pending", chip: "bg-pz-secondary-fixed text-pz-on-secondary-fixed", bar: "bg-pz-secondary-container" },
  { key: "reserved", chip: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed", bar: "bg-pz-tertiary-container" },
  { key: "underpaid", chip: "bg-pz-error-container text-pz-on-error-container", bar: "bg-pz-error" },
  { key: "paid", chip: "bg-pz-primary-fixed text-pz-on-primary-fixed", bar: "bg-pz-primary-container" },
] as const;

type Row = { key: keyof Campaign["counts"]; chip: string; bar: string };
const FREE_ROW: Row = { key: "free", chip: "bg-pz-surface-container-high text-pz-on-surface-variant", bar: "bg-pz-outline-variant" };

function AllRegistrationsLink({ total }: { total?: number }) {
  return (
    <Link
      href={ALL_HREF}
      className="group flex flex-col items-end px-3.5 py-2 rounded-lg bg-pz-surface-container-lowest shadow-sm hover:shadow-md transition-all"
    >
      <span className="flex items-center gap-1.5 text-xs font-headline font-bold text-pz-primary group-hover:text-pz-on-primary-container">
        All registrations
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      {total !== undefined && (
        <span className="text-[10px] font-label text-pz-on-surface-variant">{total} records across campaigns</span>
      )}
    </Link>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const state = PAGE_STATE[c.pageStatus];
  const rows: Row[] = c.counts.free > 0 ? [...STATUS_ROWS, FREE_ROW] : [...STATUS_ROWS];
  return (
    <Link
      href={`${CAMPAIGN_HREF}/${c.pageId}`}
      className="group relative bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-headline font-bold", state.cls)}>
          {state.pulse && <span className="w-1.5 h-1.5 rounded-full bg-pz-primary animate-pulse" aria-hidden="true" />}
          {state.label}
        </span>
        <span className="text-xs font-headline font-bold text-pz-primary group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
          Open campaign <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
      <h2 className="text-base font-headline font-extrabold text-pz-on-surface group-hover:text-pz-primary transition-colors leading-snug line-clamp-2">
        {c.title}
      </h2>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-headline font-black text-pz-on-surface tracking-tight">{c.total}</span>
        <span className="text-xs font-body text-pz-on-surface-variant font-medium">registrations</span>
      </div>
      <div className="w-full h-1.5 bg-pz-surface-container-low rounded-full overflow-hidden flex my-3.5" aria-hidden="true">
        {rows.map((r) =>
          c.counts[r.key] > 0 && c.total > 0 ? (
            <div key={r.key} className={cn("h-full", r.bar)} style={{ width: `${(c.counts[r.key] / c.total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {rows.map((r) => (
          <span
            key={r.key}
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-headline font-bold",
              c.counts[r.key] === 0 ? "bg-pz-surface-container-high text-pz-on-surface-variant opacity-60" : r.chip,
            )}
          >
            {`${c.counts[r.key]} ${r.key}`}
          </span>
        ))}
      </div>
    </Link>
  );
}

/** Campaign cards, one per landing page that has registrations, newest first. */
export function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  const total = campaigns.reduce((n, c) => n + c.total, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">Registrations</h1>
          <p className="font-body text-pz-on-surface-variant text-sm mt-1 max-w-2xl">
            Pick a campaign to see its sign-ups, or open the full list of every registration.
          </p>
        </div>
        <AllRegistrationsLink total={campaigns.length > 0 ? total : undefined} />
      </div>
      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Campaigns show up here once people start registering through a landing page."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((c) => (
            <CampaignCard key={c.pageId} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
