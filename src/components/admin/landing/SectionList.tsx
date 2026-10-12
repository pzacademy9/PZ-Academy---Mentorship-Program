"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { SECTION_DEFS, type SectionType } from "@/lib/landing/sections";
import type { LandingSection } from "@/lib/landing/content";
import { AddSectionMenu } from "./AddSectionMenu";

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 max-md:h-11 max-md:w-11";

export function SectionList({
  sections, selectedId, onSelect, onToggle, onMove, onRemove, onAdd,
}: {
  sections: LandingSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: (type: SectionType) => void;
}) {
  const confirm = useConfirm();

  async function askRemove(s: LandingSection) {
    const label = SECTION_DEFS[s.type].label;
    const ok = await confirm({
      title: "Remove this section?",
      description: `"${label}" and everything you wrote in it will be removed from this page.`,
      confirmLabel: "Remove section",
      destructive: true,
    });
    if (ok) onRemove(s.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-headline text-xs font-bold uppercase tracking-wider text-pz-on-surface-variant">Page sections</h2>
        <span className="rounded-full bg-pz-surface-container-high px-2 py-0.5 font-body text-[11px] font-semibold text-pz-on-surface-variant">{sections.length} total</span>
      </div>
      <ul className="space-y-1.5">
        {sections.map((s, i) => {
          const label = SECTION_DEFS[s.type].label;
          const selected = s.id === selectedId;
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5",
                selected ? "border-pz-solid-forest bg-pz-primary-container/40" : "border-pz-outline-variant bg-pz-surface-container-lowest",
                !s.enabled && "opacity-80",
              )}
            >
              <button
                type="button"
                role="switch"
                aria-checked={s.enabled}
                aria-label={`Show ${label}`}
                onClick={() => onToggle(s.id)}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-7 max-md:w-12",
                  s.enabled ? "bg-pz-solid-forest" : "bg-pz-outline-variant",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-pz-surface-container-lowest transition-all max-md:h-6 max-md:w-6",
                    s.enabled ? "left-[1.125rem] max-md:left-[1.375rem]" : "left-0.5",
                  )}
                />
              </button>
              <button
                type="button"
                aria-label={`Edit ${label}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(s.id)}
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
              >
                <span className={cn("block truncate font-body text-sm font-semibold", s.enabled ? "text-pz-on-surface" : "text-pz-on-surface-variant")}>{label}</span>
                {!s.enabled && <span className="block font-body text-[11px] text-pz-on-surface-variant">Hidden from the page</span>}
              </button>
              <button type="button" className={ICON_BTN} aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(s.id, -1)}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={ICON_BTN} aria-label={`Move ${label} down`} disabled={i === sections.length - 1} onClick={() => onMove(s.id, 1)}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={cn(ICON_BTN, "hover:text-pz-danger")} aria-label={`Remove ${label}`} onClick={() => void askRemove(s)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <AddSectionMenu onAdd={onAdd} />
    </div>
  );
}
