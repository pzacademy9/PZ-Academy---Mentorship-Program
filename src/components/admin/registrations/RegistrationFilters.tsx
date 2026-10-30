import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { REGISTRATION_STATUS_LABELS } from "./RegistrationStatusBadge";
import { registrationHref, type RegistrationQuery } from "./query";
import { QuickFilters } from "./QuickFilters";

const TABS: (RegistrationStatus | "all")[] = ["all", "pending", "reserved", "underpaid", "paid", "free"];

const SELECT =
  "h-9 pl-3 pr-8 bg-pz-surface-container-lowest border border-pz-outline-variant/40 rounded-lg text-xs font-headline font-semibold text-pz-on-surface min-w-[10rem]";

/**
 * Status tabs (links, so they keep every other filter) plus a plain GET form for search,
 * page, live-or-recorded and (admin only) agent. Zero JS, shareable URLs.
 */
export function RegistrationFilters({
  basePath,
  filters,
  counts,
  pageOptions,
  agentOptions,
  campaignOptions,
}: {
  basePath: string;
  filters: RegistrationQuery;
  counts: Record<RegistrationStatus | "all", number>;
  pageOptions: { id: string; title: string }[];
  /** Pass for the admin view only; leave out and the Agent filter is not shown. */
  agentOptions?: { id: string; name: string }[];
  /**
   * Campaign page only: the page is fixed by the address, so the Page choice is dropped and
   * Country and What they bought are offered instead.
   */
  campaignOptions?: { regions: string[]; optionLabels: string[] };
}) {
  const active = filters.status && filters.status !== "all" ? filters.status : "all";
  const anyFilter = Boolean(filters.q || filters.mode || filters.pageId || filters.agentId || filters.region || filters.optionLabel || filters.optionScopes);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {TABS.map((tab) => {
          const selected = tab === active;
          return (
            <Link
              key={tab}
              href={registrationHref(basePath, filters, { status: tab, p: 1 })}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "px-5 py-2 rounded-full font-headline text-sm transition-all",
                selected
                  ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
                  : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium",
              )}
            >
              {tab === "all" ? "All" : REGISTRATION_STATUS_LABELS[tab]}
              <span className={cn("ml-2 tabular-nums", !selected && "text-pz-on-surface-variant/60 dark:text-pz-on-surface-variant/80")}>
                {counts[tab]}
              </span>
            </Link>
          );
        })}
      </div>

      {campaignOptions && <QuickFilters basePath={basePath} filters={filters} />}

      <form method="get" action={basePath} className="flex flex-wrap items-center gap-3 rounded-xl bg-pz-surface-container-low/60 px-4 py-3">
        {active !== "all" && <input type="hidden" name="status" value={active} />}
        {filters.optionScopes && <input type="hidden" name="optionScopes" value={filters.optionScopes} />}
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            aria-label="Search registrations"
            placeholder="Search name, email or reference"
            className="w-full h-9 pl-9 pr-3 bg-pz-surface-container-lowest border border-pz-outline-variant/40 rounded-lg text-xs font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/60"
          />
        </div>
        {!campaignOptions && (
          <select name="pageId" defaultValue={filters.pageId ?? ""} aria-label="Page" className={SELECT}>
            <option value="">All pages</option>
            {pageOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        )}
        {campaignOptions && (
          <>
            <select name="region" defaultValue={filters.region ?? ""} aria-label="Country" className={SELECT}>
              <option value="">All countries</option>
              {campaignOptions.regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select name="optionLabel" defaultValue={filters.optionLabel ?? ""} aria-label="What they bought" className={SELECT}>
              <option value="">What they bought</option>
              {campaignOptions.optionLabels.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </>
        )}
        <select name="mode" defaultValue={filters.mode ?? ""} aria-label="Live or recorded" className={SELECT}>
          <option value="">Live or recorded</option>
          <option value="live">Live</option>
          <option value="recorded">Recorded</option>
        </select>
        {agentOptions && (
          <select name="agentId" defaultValue={filters.agentId ?? ""} aria-label="Agent" className={SELECT}>
            <option value="">All agents</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <button type="submit" className="h-9 px-4 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-xs">
          Apply
        </button>
        {anyFilter && (
          <Link
            href={registrationHref(basePath, { status: filters.status })}
            className="inline-flex items-center h-9 px-3 rounded-lg text-xs font-headline font-semibold text-pz-on-surface-variant hover:text-pz-on-surface"
          >
            Reset
          </Link>
        )}
      </form>
    </div>
  );
}
