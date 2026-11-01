"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, FlaskConical, Presentation, Search, ShieldCheck, Users } from "lucide-react";
import type { FindMyIdByNameResult } from "@/app/progress/actions";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import type { ProgressKind } from "@/lib/progress/build";
import type { PortalBatchCard } from "@/lib/progress/portal-build";
import { MyIdSection } from "../MyIdSection";
import { btnFocus, inputClass } from "../ui";

export type PortalGroup = { kind: ProgressKind; batches: PortalBatchCard[] };

const LABELS: Record<ProgressKind, string> = { course: "Courses", workshop: "Workshops", webinar: "Webinars" };
const KIND_ICON = { course: BookOpen, workshop: FlaskConical, webinar: Presentation } as const;
const ORDER: ProgressKind[] = ["course", "workshop", "webinar"];
const CHIP: Record<PortalBatchCard["state"], { text: string; cls: string }> = {
  live: { text: "Live", cls: "bg-pz-primary-container text-pz-on-primary-container" },
  completed: { text: "Completed", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed" },
  recorded: { text: "Recorded", cls: "bg-pz-surface-container-high text-pz-on-surface-variant" },
};

interface Props {
  groups: PortalGroup[];
  /** Name lookup. When missing, the Find my ID box is not shown. */
  findId?: (query: string) => Promise<FindMyIdByNameResult>;
  /** The batch list could not be loaded. */
  failed?: boolean;
}

export function PortalHome({ groups, findId, failed = false }: Props) {
  const [tab, setTab] = useState<ProgressKind | "all">("all");
  const [term, setTerm] = useState("");

  const ordered = ORDER.map((kind) => ({ kind, batches: groups.find((g) => g.kind === kind)?.batches ?? [] }));
  const total = ordered.reduce((n, g) => n + g.batches.length, 0);
  const needle = term.trim().toLowerCase();
  const shown = ordered
    .filter((g) => tab === "all" || g.kind === tab)
    .map((g) => ({ ...g, batches: g.batches.filter((b) => needle === "" || b.title.toLowerCase().includes(needle)) }))
    .filter((g) => g.batches.length > 0);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5">
      <p className="flex min-w-0 items-start gap-2 rounded-xl bg-pz-surface-container-high px-3.5 py-2.5 text-sm text-pz-on-surface-variant">
        <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-pz-primary" />
        <span>First name and ID only. No phone or email shown.</span>
      </p>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <div className="min-w-0">
            <h1 className="font-headline text-3xl font-black tracking-tight text-pz-on-surface sm:text-4xl">Progress Portal</h1>
            <p className="mt-1 text-base text-pz-on-surface-variant">See attendance and quiz results for every batch.</p>
          </div>
        </div>
        {findId && (
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <MyIdSection findId={findId} />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1">
          <div className="relative min-w-0">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-pz-outline" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search a batch"
              placeholder="Search a batch"
              className={`${inputClass} pl-11`}
            />
          </div>
          <div role="tablist" aria-label="Batch type" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-pz-surface-container-high p-1">
            {ordered.map((g) => (
              <button
                key={g.kind}
                type="button"
                role="tab"
                aria-selected={tab === g.kind}
                onClick={() => setTab(tab === g.kind ? "all" : g.kind)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 font-headline text-sm font-bold transition-colors motion-reduce:transition-none ${btnFocus} ${
                  tab === g.kind
                    ? "bg-pz-surface-container-lowest text-pz-primary shadow-sm"
                    : "text-pz-on-surface-variant hover:bg-pz-surface-variant"
                }`}
              >
                {LABELS[g.kind]}
                <span className="rounded-full bg-pz-surface-container-highest px-2 py-0.5 text-sm text-pz-on-surface">{g.batches.length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {failed ? (
        <p role="alert" className="rounded-xl bg-pz-error-container p-4 text-base text-pz-on-error-container">
          We could not load the batches right now. Please try again in a minute.
        </p>
      ) : total === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No batches yet</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No batches match your search.</p>
      ) : (
        shown.map((g) => (
          <section key={g.kind} aria-labelledby={`group-${g.kind}`} className="flex min-w-0 flex-col gap-3">
            <h2 id={`group-${g.kind}`} className="font-headline text-xl font-bold text-pz-on-surface">
              {LABELS[g.kind]}
            </h2>
            <ul className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {g.batches.map((b) => (
                <li key={b.slug} className="min-w-0">
                  <BatchCard batch={b} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function BatchCard({ batch: b }: { batch: PortalBatchCard }) {
  const chip = CHIP[b.state];
  const pct = b.classesTotal > 0 ? Math.round((b.classesHeld / b.classesTotal) * 100) : 0;
  const recorded = b.state === "recorded";
  const Icon = KIND_ICON[b.kind];
  return (
    <Link
      href={`/progress/${b.slug}`}
      prefetch={false}
      className={`flex h-full min-h-11 min-w-0 flex-col gap-3 overflow-hidden rounded-xl bg-pz-surface-container-lowest pb-4 shadow-sm ring-1 ring-pz-outline-variant/40 transition-colors hover:bg-pz-surface-container-low motion-reduce:transition-none ${btnFocus}`}
    >
      {b.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Drive covers go through /api/cover; fixed aspect box prevents layout shift
        <img
          src={coverProxyUrl(b.coverUrl)}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          decoding="async"
          className="aspect-video w-full bg-pz-surface-container-high object-cover"
        />
      ) : (
        <div
          data-cover-placeholder
          aria-hidden
          className="flex aspect-video w-full items-center justify-center bg-pz-primary-container text-pz-on-primary-container"
        >
          <Icon className="h-10 w-10 opacity-70" />
        </div>
      )}
      <div className="flex min-w-0 items-start justify-between gap-3 px-4">
        <h3 className="min-w-0 break-words font-headline text-lg font-bold leading-snug text-pz-on-surface">{b.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 font-headline text-sm font-bold ${chip.cls}`}>{chip.text}</span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2 px-4 text-sm text-pz-on-surface-variant">
        {!recorded && (
          <span className="rounded-md bg-pz-surface-container-high px-2.5 py-1">
            {b.classesHeld} of {b.classesTotal} classes held
          </span>
        )}
        <span className="flex items-center gap-1.5 rounded-md bg-pz-surface-container-high px-2.5 py-1">
          <Users aria-hidden className="h-4 w-4" />
          {b.students} {b.students === 1 ? "student" : "students"}
        </span>
      </div>
      {recorded ? (
        <p className="px-4 text-sm font-semibold text-pz-on-surface-variant">Self-paced</p>
      ) : (
        <div
          role="progressbar"
          aria-label="Classes held"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mx-4 h-2 overflow-hidden rounded-full bg-pz-surface-container-highest"
        >
          <div className={`h-full rounded-full ${b.state === "completed" ? "bg-pz-secondary" : "bg-pz-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="mt-auto flex items-center justify-between px-4 font-headline text-sm font-bold text-pz-primary">
        View batch progress
        <ArrowRight aria-hidden className="h-5 w-5" />
      </span>
    </Link>
  );
}
