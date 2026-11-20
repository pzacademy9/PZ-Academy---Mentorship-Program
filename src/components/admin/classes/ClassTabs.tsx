"use client";

import { useRef, type KeyboardEvent } from "react";
import { Link2, Trophy, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dsFocus, dsSegOff, dsSegOn, dsSegTrack } from "./ds";
import { CLASS_TABS, CLASS_TAB_LABELS, CLASS_TAB_SHORT_LABELS, classTabId, type ClassTab } from "@/lib/classes/tabs";

const ICON: Record<ClassTab, LucideIcon> = { links: Link2, attendance: UserCheck, quiz: Trophy };

/**
 * Segmented control on a phone, underlined tabs from md up. Sticky under the top bar (h-16).
 * Left/Right move and activate (wrapping), Home/End jump to the first/last.
 */
export function ClassTabs({
  active, onChange, counts, panelId,
}: {
  active: ClassTab;
  onChange: (t: ClassTab) => void;
  counts?: Partial<Record<ClassTab, string>>;
  panelId: (t: ClassTab) => string;
}) {
  const refs = useRef<Partial<Record<ClassTab, HTMLButtonElement | null>>>({});

  function move(to: ClassTab) {
    onChange(to);
    refs.current[to]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, t: ClassTab) {
    const i = CLASS_TABS.indexOf(t);
    let next: ClassTab | null = null;
    if (e.key === "ArrowRight") next = CLASS_TABS[(i + 1) % CLASS_TABS.length];
    else if (e.key === "ArrowLeft") next = CLASS_TABS[(i - 1 + CLASS_TABS.length) % CLASS_TABS.length];
    else if (e.key === "Home") next = CLASS_TABS[0];
    else if (e.key === "End") next = CLASS_TABS[CLASS_TABS.length - 1];
    if (next) {
      e.preventDefault();
      move(next);
    }
  }

  return (
    <div className="sticky top-16 z-10 -mx-4 border-b border-[#D4EACC] bg-[#F7FAF5] px-4 py-2 font-poppins dark:border-pz-outline-variant/60 dark:bg-pz-surface md:mx-0 md:px-0 md:py-0">
      <div
        role="tablist"
        aria-label="Class sections"
        className={`grid grid-cols-3 gap-1 ${dsSegTrack} md:flex md:gap-8 md:rounded-none md:bg-transparent md:p-0 md:dark:bg-transparent`}
      >
        {CLASS_TABS.map((t) => {
          const selected = t === active;
          const Icon = ICON[t];
          return (
            <button
              key={t}
              ref={(el) => { refs.current[t] = el; }}
              id={classTabId(t)}
              type="button"
              role="tab"
              aria-label={CLASS_TAB_LABELS[t]}
              aria-selected={selected}
              aria-controls={panelId(t)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t)}
              onKeyDown={(e) => onKeyDown(e, t)}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-2 font-poppins text-base font-semibold transition-colors",
                "md:-mb-px md:rounded-none md:border-b-2 md:px-1",
                dsFocus,
                selected
                  ? `${dsSegOn} md:border-[#196432] md:bg-transparent md:text-[#196432] md:dark:border-pz-primary md:dark:bg-transparent md:dark:text-pz-primary`
                  : `${dsSegOff} md:border-transparent`,
              )}
            >
              <Icon className="hidden size-5 md:block" strokeWidth={1.75} aria-hidden />
              <span className="md:hidden" aria-hidden>{CLASS_TAB_SHORT_LABELS[t]}</span>
              <span className="hidden md:inline" aria-hidden>{CLASS_TAB_LABELS[t]}</span>
              {counts?.[t] && (
                <span className="hidden rounded-full bg-[#EAF5E4] px-2 py-0.5 font-fredoka text-[15px] font-normal text-[#4D6B54] dark:bg-pz-surface-container-high dark:text-pz-on-surface-variant md:inline">
                  {counts[t]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
