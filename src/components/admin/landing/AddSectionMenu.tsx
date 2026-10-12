"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { SECTION_DEFS, SECTION_TYPES, type SectionType } from "@/lib/landing/sections";

/** "+ Add section" opens an inline list of every section type with its plain-language description. */
export function AddSectionMenu({ onAdd }: { onAdd: (type: SectionType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-pz-outline-variant px-3 py-2.5 font-body text-sm font-semibold text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
      >
        <PlusCircle className="h-4 w-4" aria-hidden="true" />
        Add section
      </button>
      {open && (
        <div className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-2">
          <p className="px-2 pb-1 pt-1 font-headline text-[11px] font-bold uppercase tracking-wider text-pz-on-surface-variant">Choose section type</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {SECTION_TYPES.map((type) => {
              const def = SECTION_DEFS[type];
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => { onAdd(type); setOpen(false); }}
                    className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
                  >
                    <span className="block font-body text-sm font-semibold text-pz-on-surface">{def.label}</span>
                    <span className="block font-body text-xs text-pz-on-surface-variant">{def.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
