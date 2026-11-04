"use client";

import { AREAS, type Area } from "@/lib/team/areas";
import { areaLabel } from "@/lib/team/summary";

/** Tick list of the areas a person may open. The Team area is never offered: only the Super Admin has it. */
export function AreaTicks({ value, onChange }: { value: Area[]; onChange: (next: Area[]) => void }) {
  const toggle = (a: Area) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">Areas this person can open</legend>
      {AREAS.filter((a) => a !== "team").map((a) => (
        <label
          key={a}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface"
        >
          <input
            type="checkbox"
            checked={value.includes(a)}
            onChange={() => toggle(a)}
            className="h-5 w-5 shrink-0 accent-pz-primary"
          />
          {areaLabel(a)}
        </label>
      ))}
    </fieldset>
  );
}
