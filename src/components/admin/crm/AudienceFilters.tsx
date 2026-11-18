"use client";

import { useId, useState } from "react";
import { AUDIENCE_STATUSES, type AudienceFilter } from "@/lib/crm/audience-filter";
import type { AudienceFacets } from "@/lib/data/audience-query";
import { Chip, FilterCard, SegmentedControl } from "@/components/admin/crm/audience-controls";

const COURSES_SHOWN = 8;
const SEARCH_SHOWN = 20;

const MODE_OPTIONS: { value: AudienceFilter["mode"]; label: string }[] = [
  { value: "either", label: "Either" },
  { value: "recorded", label: "Recorded" },
  { value: "live", label: "Live" },
];
function countryName(code: string): string {
  if (code === "AE") return "UAE";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// Keeps the fixed display order whatever order the chips were ticked in.
const toggleStatus = (list: AudienceFilter["statuses"], v: AudienceFilter["statuses"][number]) =>
  AUDIENCE_STATUSES.map((s) => s.value).filter((x) => (x === v ? !list.includes(v) : list.includes(x)));

const dateInput =
  "min-h-11 w-full rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-base md:text-sm";

export function AudienceFilters({
  filter,
  facets,
  onChange,
}: {
  filter: AudienceFilter;
  facets: AudienceFacets;
  onChange: (f: AudienceFilter) => void;
}) {
  const ids = useId();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const set = (patch: Partial<AudienceFilter>) => onChange({ ...filter, ...patch });

  // Shown: the first few courses plus any chosen one (also a chosen course that no longer exists).
  const top = facets.courses.slice(0, COURSES_SHOWN).map((c) => c.name);
  const shown = [...top, ...filter.courses.filter((c) => !top.includes(c))];
  const hidden = facets.courses.map((c) => c.name).filter((n) => !shown.includes(n));
  const q = search.trim().toLowerCase();
  const matches = (q ? hidden.filter((n) => n.toLowerCase().includes(q)) : hidden).slice(0, SEARCH_SHOWN);

  const countryCodes = [...facets.countries.map((c) => c.code), ...filter.countries.filter((c) => c !== "unknown" && !facets.countries.some((x) => x.code === c))];

  return (
    <div className="space-y-4">
      <FilterCard
        titleId={`${ids}-course`}
        title="Course"
        helper="Pick one or more courses. Pick none for every course."
      >
        <div className="flex flex-wrap gap-2">
          {shown.map((name) => (
            <Chip key={name} on={filter.courses.includes(name)} onClick={() => set({ courses: toggle(filter.courses, name) })}>
              {name}
            </Chip>
          ))}
          {hidden.length > 0 && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex min-h-11 items-center rounded-full border border-pz-outline-variant px-4 py-2 font-body text-sm text-pz-primary"
            >
              Add course
            </button>
          )}
          {facets.courses.length === 0 && filter.courses.length === 0 && (
            <p className="font-body text-sm text-pz-on-surface-variant">No courses yet.</p>
          )}
        </div>
        {adding && hidden.length > 0 && (
          <div className="space-y-2">
            <label htmlFor={`${ids}-search`} className="font-body text-xs font-medium text-pz-on-surface-variant">
              Find a course
            </label>
            <input
              id={`${ids}-search`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type part of the name"
              className={dateInput}
            />
            <div className="flex flex-wrap gap-2">
              {matches.map((name) => (
                <Chip key={name} on={false} onClick={() => set({ courses: [...filter.courses, name] })}>
                  {name}
                </Chip>
              ))}
              {matches.length === 0 && <p className="font-body text-sm text-pz-on-surface-variant">No course matches.</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setSearch("");
              }}
              className="min-h-11 font-body text-sm text-pz-primary underline"
            >
              Done
            </button>
          </div>
        )}
      </FilterCard>

      <FilterCard titleId={`${ids}-mode`} title="Recorded or live">
        <SegmentedControl label="Recorded or live" value={filter.mode} options={MODE_OPTIONS} onChange={(mode) => set({ mode })} />
        {filter.mode !== "either" && (
          <p className="font-body text-xs text-pz-on-surface-variant">
            Older sheets may not say Recorded or Live, so those people only appear under Either.
          </p>
        )}
      </FilterCard>

      <FilterCard titleId={`${ids}-country`} title="Country" helper="Pick none for every country.">
        <div className="flex flex-wrap gap-2">
          {countryCodes.map((code) => (
            <Chip key={code} on={filter.countries.includes(code)} onClick={() => set({ countries: toggle(filter.countries, code) })}>
              {countryName(code)}
            </Chip>
          ))}
          <Chip on={filter.countries.includes("unknown")} onClick={() => set({ countries: toggle(filter.countries, "unknown") })}>
            {`Not known (${facets.unknownCountry.toLocaleString("en-US")})`}
          </Chip>
        </div>
        <p className="font-body text-xs text-pz-on-surface-variant">Country comes from the phone number.</p>
      </FilterCard>

      <FilterCard titleId={`${ids}-status`} title="Payment status" helper="Tick none to include everyone.">
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_STATUSES.map(({ value, label }) => {
            const num = facets.statusCounts[value];
            return (
              <Chip
                key={value}
                on={filter.statuses.includes(value)}
                onClick={() => set({ statuses: toggleStatus(filter.statuses, value) })}
                describedBy={value === "part_paid" ? `${ids}-part-paid` : undefined}
                ariaLabel={num === undefined ? undefined : `${label}, ${num.toLocaleString("en-US")} ${num === 1 ? "person" : "people"}`}
              >
                {label}
                {num !== undefined && (
                  <span aria-hidden="true" className="ml-2 text-xs tabular-nums opacity-80">
                    {num.toLocaleString("en-US")}
                  </span>
                )}
              </Chip>
            );
          })}
        </div>
        <span id={`${ids}-part-paid`} className="sr-only">Part-paid is also called underpaid.</span>
        <p className="font-body text-xs text-pz-on-surface-variant">
          Reserved: a seat is held until they pay, for example people you added by hand.
        </p>
      </FilterCard>

      <FilterCard titleId={`${ids}-dates`} title="Registered between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${ids}-from`} className="font-body text-xs font-medium text-pz-on-surface-variant">From</label>
            <input
              id={`${ids}-from`}
              type="date"
              value={filter.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
              className={dateInput}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${ids}-to`} className="font-body text-xs font-medium text-pz-on-surface-variant">To</label>
            <input
              id={`${ids}-to`}
              type="date"
              value={filter.to ?? ""}
              onChange={(e) => set({ to: e.target.value || null })}
              className={dateInput}
            />
          </div>
        </div>
        <p className="font-body text-xs text-pz-on-surface-variant">Leave empty for any date.</p>
      </FilterCard>
    </div>
  );
}
