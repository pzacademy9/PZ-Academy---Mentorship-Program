"use client";
// src/components/landing/sections/ScheduleClassTime.tsx
// "Class time" line above the schedule entries: the visitor's country time, picked from their device clock, changeable.
import { useEffect, useId, useState } from "react";
import { regionFromTimeZone } from "@/lib/landing/registration/class-time";
import { publicRegionLabel } from "@/lib/landing/registration/region-label";

export interface ClassTimeRegion { key: string; label: string; classTime: string; timezoneLabel: string }

export function ScheduleClassTime({ regions, defaultKey }: { regions: ClassTimeRegion[]; defaultKey: string }) {
  const selectId = useId();
  const first = regions.some((g) => g.key === defaultKey) ? defaultKey : regions[0]?.key ?? "";
  const [key, setKey] = useState(first);
  useEffect(() => {
    try { setKey(regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, regions, defaultKey)); } catch { /* keep the default */ }
  }, [regions, defaultKey]);
  const region = regions.find((g) => g.key === key) ?? regions[0];
  if (!region) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-landing border border-landing-mint/40 bg-landing-mint-light px-4 py-3 text-center md:mb-6">
      <p className="text-sm font-semibold text-landing-deep md:text-base">
        {`Class time: ${region.classTime}`}{region.timezoneLabel ? <span className="ml-1 font-normal text-landing-muted">{`(${region.timezoneLabel})`}</span> : null}
      </p>
      {regions.length > 1 ? (
        <>
          <label htmlFor={selectId} className="sr-only">Show the class time for</label>
          <select
            id={selectId}
            value={region.key}
            onChange={(e) => setKey(e.target.value)}
            className="min-h-[44px] rounded-landing border border-landing-border bg-landing-surface px-3 text-sm font-semibold text-landing-deep"
          >
            {regions.map((g) => <option key={g.key} value={g.key}>{publicRegionLabel(g) || g.key}</option>)}
          </select>
        </>
      ) : null}
    </div>
  );
}
