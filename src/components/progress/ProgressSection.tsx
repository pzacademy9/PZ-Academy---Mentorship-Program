"use client";

import { useRef, useState, type RefObject } from "react";
import { ClipboardCheck, GraduationCap, Trophy } from "lucide-react";
import type { Progress, ProgressKind } from "@/lib/progress/build";
import { BatchCard, type ProgressView } from "./BatchCard";
import { btnFocus } from "./ui";

const GROUP_LABEL: Record<ProgressKind, string> = {
  course: "Courses",
  workshop: "Workshops",
  webinar: "Webinars",
};

const TABS: { id: ProgressView; label: string; Icon: typeof Trophy }[] = [
  { id: "attendance", label: "Attendance", Icon: ClipboardCheck },
  { id: "results", label: "Quiz Results", Icon: Trophy },
];

interface Props {
  progress: Progress;
  headingRef?: RefObject<HTMLHeadingElement>;
  /** The page already shows its own greeting and PZ ID. */
  hideHello?: boolean;
}

const cardKey = (kind: ProgressKind, slug: string, i: number) => `pb-${kind}-${i}-${slug.replace(/[^a-zA-Z0-9_-]/g, "")}`;

export function ProgressSection({ progress, headingRef, hideHello = false }: Props) {
  const [view, setView] = useState<ProgressView>("attendance");
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of progress.groups) g.batches.forEach((b, i) => (init[cardKey(g.kind, b.slug, i)] = b.latest));
    return init;
  });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onTabKey(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setView(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const groups = progress.groups.filter((g) => g.batches.length > 0);

  return (
    <section aria-labelledby={hideHello ? undefined : "progress-hello"} aria-label={hideHello ? "Your batches" : undefined} className="flex min-w-0 flex-col gap-4">
      {!hideHello && (<div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-pz-surface-container-lowest p-4 shadow-sm ring-1 ring-pz-outline-variant/40">
        <div className="min-w-0">
          <h2
            id="progress-hello"
            ref={headingRef}
            tabIndex={-1}
            className="break-words font-headline text-xl font-black text-pz-on-surface focus:outline-none"
          >
            Hello, {progress.firstName}
          </h2>
          <p className="text-sm text-pz-on-surface-variant">
            PZ ID: <span className="break-all font-headline font-bold text-pz-primary">{progress.pzId}</span>
          </p>
        </div>
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pz-surface-container-high text-pz-primary">
          <GraduationCap className="h-6 w-6" />
        </span>
      </div>)}

      {groups.length === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-lowest p-4 text-base text-pz-on-surface-variant shadow-sm">
          We found your ID, but there are no classes to show yet. Please check again after your first class.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="What to show"
            className="flex min-w-0 gap-1 rounded-lg bg-pz-surface-container p-1"
          >
            {TABS.map((t, i) => {
              const selected = view === t.id;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`progress-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`progress-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setView(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 font-headline text-sm font-bold transition-colors motion-reduce:transition-none ${btnFocus} ${
                    selected ? "bg-pz-surface-container-lowest text-pz-primary shadow-sm" : "text-pz-on-surface-variant hover:text-pz-on-surface"
                  }`}
                >
                  <t.Icon aria-hidden className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{t.label}</span>
                </button>
              );
            })}
          </div>

          {TABS.map((t) =>
            view === t.id ? (
              <div
                key={t.id}
                role="tabpanel"
                id={`progress-panel-${t.id}`}
                aria-labelledby={`progress-tab-${t.id}`}
                className="flex min-w-0 flex-col gap-5"
              >
                {groups.map((g) => (
                  <div key={g.kind} className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 px-1">
                      <h3 className="font-headline text-sm font-bold uppercase tracking-wider text-pz-outline">
                        {GROUP_LABEL[g.kind]}
                      </h3>
                      <span className="font-label text-sm text-pz-secondary">
                        {g.batches.length} {g.batches.length === 1 ? "batch" : "batches"}
                      </span>
                    </div>
                    {g.batches.map((b, i) => {
                      const key = cardKey(g.kind, b.slug, i);
                      return (
                        <BatchCard
                          key={key}
                          id={`${key}-${t.id}`}
                          batch={b}
                          view={t.id}
                          open={open[key] ?? false}
                          onToggle={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div key={t.id} role="tabpanel" id={`progress-panel-${t.id}`} aria-labelledby={`progress-tab-${t.id}`} hidden />
            ),
          )}
        </>
      )}
    </section>
  );
}
