"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { activeFilterCount, registrationHref, type RegistrationQuery } from "./query";
import { QuickFilters } from "./QuickFilters";
import { StatusTabs } from "./StatusTabs";

const SECTION_LABEL = "block mb-2 text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant";
const CHIP =
  "inline-flex items-center justify-center max-md:min-h-11 min-h-9 px-4 rounded-full border border-pz-outline-variant/40 bg-pz-surface-container-lowest text-sm font-headline font-semibold text-pz-on-surface-variant cursor-pointer transition-colors hover:bg-pz-surface-container peer-checked:bg-pz-primary-container peer-checked:text-pz-on-primary-container peer-checked:border-transparent peer-focus-visible:ring-2 peer-focus-visible:ring-pz-primary";

/** One radio styled as a chip: the real input stays in the page (keyboard and screen reader friendly). */
function Chip({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="relative inline-flex max-w-full">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className={`${CHIP} max-w-full break-words text-center`}>{label}</span>
    </label>
  );
}

/** Search, the Filters button with its panel, and the status tabs for one campaign. */
export function CampaignToolbar({
  basePath,
  filters,
  counts,
  options,
  toolsSlot,
  historySlot,
}: {
  basePath: string;
  filters: RegistrationQuery;
  counts: Record<RegistrationStatus | "all", number>;
  options: { regions: string[]; optionLabels: string[] };
  /** Shown beside the Filters button on phone only (the Batch tools button). */
  toolsSlot?: ReactNode;
  /** The History icon, beside the Filters button on every width. */
  historySlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headingId = useId();
  const filtersRef = useRef<HTMLButtonElement>(null);
  const count = activeFilterCount(filters);
  const status = filters.status && filters.status !== "all" ? filters.status : undefined;

  // Close the panel and put focus back on the Filters button.
  function closePanel() {
    setOpen(false);
    filtersRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        filtersRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the address clean: fields left on "All" or "Either" are not sent at all.
  function dropEmptyFields(e: FormEvent<HTMLFormElement>) {
    for (const el of Array.from(e.currentTarget.elements)) {
      if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name && el.value === "") {
        el.disabled = true;
      }
    }
  }

  const filtersButton = (
    <button
      ref={filtersRef}
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      className="inline-flex items-center gap-2 h-11 md:h-12 px-4 rounded-xl border border-pz-outline-variant/40 bg-pz-surface-container-lowest hover:bg-pz-surface-container text-sm font-headline font-semibold text-pz-on-surface transition-colors"
    >
      <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
      Filters
      {count > 0 && (
        <span
          data-testid="filters-badge"
          className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-pz-primary text-pz-on-primary text-[11px] font-bold tabular-nums"
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center xl:flex-nowrap">
        <form role="search" method="get" action={basePath} onSubmit={dropEmptyFields} className="relative w-full md:w-72 md:flex-none lg:w-80">
          {status && <input type="hidden" name="status" value={status} />}
          {filters.mode && <input type="hidden" name="mode" value={filters.mode} />}
          {filters.region && <input type="hidden" name="region" value={filters.region} />}
          {filters.optionLabel && <input type="hidden" name="optionLabel" value={filters.optionLabel} />}
          {filters.optionScopes && <input type="hidden" name="optionScopes" value={filters.optionScopes} />}
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            aria-label="Search registrations"
            placeholder="Search name, email or reference"
            className="w-full h-11 md:h-12 pl-11 pr-4 rounded-full bg-pz-surface-container-lowest border border-pz-outline-variant/40 text-sm font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/60"
          />
        </form>

        <div className="flex items-center justify-between gap-3 md:justify-start">
          <div className="flex items-center gap-3">
            {filtersButton}
            {historySlot}
          </div>
          {toolsSlot && <div className="md:hidden">{toolsSlot}</div>}
        </div>

        <div className="min-w-0 md:basis-full xl:basis-0 xl:flex-1">
          <StatusTabs basePath={basePath} filters={filters} counts={counts} scroll />
        </div>
      </div>

      {open && (
        <div id={panelId} className="fixed inset-0 z-50 md:static md:z-auto">
          <button
            type="button"
            aria-label="Close filters"
            tabIndex={-1}
            onClick={closePanel}
            className="absolute inset-0 bg-pz-on-surface/40 md:hidden"
          />
          <form
            method="get"
            action={basePath}
            data-panel-form
            key={[filters.region, filters.mode, filters.optionLabel, filters.optionScopes, filters.q, filters.status].join("|")}
            onSubmit={dropEmptyFields}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-pz-surface-container-lowest shadow-xl md:relative md:max-h-none md:rounded-2xl md:border md:border-pz-outline-variant/40 md:shadow-none"
          >
            {filters.q && <input type="hidden" name="q" value={filters.q} />}
            {status && <input type="hidden" name="status" value={status} />}
            {filters.optionScopes && <input type="hidden" name="optionScopes" value={filters.optionScopes} />}

            <div className="flex items-center gap-2 px-5 pt-5 pb-3">
              <SlidersHorizontal className="w-4 h-4 text-pz-primary" aria-hidden="true" />
              <h2 id={headingId} className="font-headline text-base font-bold text-pz-on-surface">Registration Filter Criteria</h2>
              {count > 0 && <span className="ml-auto text-xs text-pz-on-surface-variant">Active presets applied</span>}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
              {options.regions.length > 0 && (
              <fieldset>
                <legend className={SECTION_LABEL}>Country</legend>
                <div className="flex flex-wrap gap-2">
                  <Chip name="region" value="" label="All" checked={!filters.region} />
                  {options.regions.map((r) => (
                    <Chip key={r} name="region" value={r} label={r} checked={filters.region === r} />
                  ))}
                </div>
              </fieldset>
              )}

              <fieldset>
                <legend className={SECTION_LABEL}>Delivery mode</legend>
                <div className="flex flex-wrap gap-2">
                  <Chip name="mode" value="" label="Either" checked={!filters.mode} />
                  <Chip name="mode" value="live" label="Live" checked={filters.mode === "live"} />
                  <Chip name="mode" value="recorded" label="Recorded" checked={filters.mode === "recorded"} />
                </div>
              </fieldset>

              {options.optionLabels.length > 0 && (
              <fieldset>
                <legend className={SECTION_LABEL}>What they bought</legend>
                <div className="flex flex-wrap gap-2">
                  <Chip name="optionLabel" value="" label="All" checked={!filters.optionLabel} />
                  {options.optionLabels.map((o) => (
                    <Chip key={o} name="optionLabel" value={o} label={o} checked={filters.optionLabel === o} />
                  ))}
                </div>
              </fieldset>
              )}

              <div>
                <span className={SECTION_LABEL}>Quick presets</span>
                <QuickFilters basePath={basePath} filters={filters} onNavigate={closePanel} />
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-pz-outline-variant/30 bg-pz-surface-container-lowest px-5 py-3 rounded-b-2xl">
              <Link
                href={registrationHref(basePath, { status: filters.status })}
                onClick={closePanel}
                className="inline-flex items-center max-md:min-h-11 px-2 text-sm font-headline font-semibold text-pz-on-surface-variant hover:text-pz-on-surface"
              >
                Reset
              </Link>
              <button
                type="submit"
                className="inline-flex items-center gap-2 max-md:min-h-11 h-11 px-5 rounded-xl bg-pz-primary text-pz-on-primary font-headline font-bold text-sm"
              >
                Show people
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
