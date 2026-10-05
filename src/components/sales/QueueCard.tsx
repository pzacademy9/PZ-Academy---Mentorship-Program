"use client";

import { Clock } from "lucide-react";
import { initials } from "@/lib/format";
import type { QueueCardJson } from "@/lib/crm/sales-ui";

const whyToday = (i: QueueCardJson) =>
  i.warm
    ? { text: "Replied before", cls: "bg-pz-primary-container/30 text-pz-on-primary-container" }
    : i.last_outcome === null
      ? { text: "New", cls: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed" }
      : { text: "Follow-up due", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed" };

export function QueueCard({
  item, selected, sent, onSelect, onSkip, onDone,
}: {
  item: QueueCardJson; selected: boolean; sent: boolean;
  onSelect: () => void; onSkip: () => void; onDone: () => void;
}) {
  const tag = whyToday(item);
  return (
    <article
      className={`bg-pz-surface-container-lowest rounded-xl p-4 transition-all relative overflow-hidden ${selected ? "shadow-card" : "shadow-sm hover:shadow-md"}`}
    >
      {selected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-pz-primary" />}
      <div className="flex items-start justify-between gap-3 pl-1.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-pz-primary/15 text-pz-primary flex items-center justify-center font-headline font-bold text-base shrink-0">
            {initials(item.full_name)}
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-headline font-bold text-pz-on-surface truncate">{item.full_name || "No name"}</h3>
            <span className="text-xs text-pz-on-surface-variant font-mono font-medium">{item.phone_e164}</span>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[11px] font-headline font-bold shrink-0 ${sent ? "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed" : tag.cls}`}>
          {sent ? "Sent" : tag.text}
        </span>
      </div>
      <div className="mt-3.5 flex items-center gap-1.5 text-xs text-pz-on-surface-variant bg-pz-surface-container-low rounded-lg p-2.5">
        <span className="truncate">{item.last_note ?? "No notes yet"}</span>
      </div>
      {item.recently_contacted && (
        <p className="mt-2 flex items-center gap-1 text-xs text-pz-secondary">
          <Clock className="w-3.5 h-3.5" /> Messaged in the last 24 hours
        </p>
      )}
      <div className="mt-3.5 flex items-center gap-2">
        <button type="button" onClick={onSelect}
          className="flex-1 h-12 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-[0.99]">
          Select
        </button>
        <button type="button" onClick={sent ? onDone : onSkip}
          className="h-12 px-3.5 rounded-lg bg-pz-surface-container text-pz-on-surface-variant hover:text-pz-on-surface hover:bg-pz-surface-container-high transition-colors font-headline text-xs font-semibold shrink-0">
          {sent ? "Done for now" : "Skip"}
        </button>
      </div>
    </article>
  );
}
