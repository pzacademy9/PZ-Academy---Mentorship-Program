"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import type { AffiliateRow } from "@/lib/data/affiliates";

type Filter = "all" | "accepted" | "dropped" | "left";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "dropped", label: "Dropped" },
  { key: "left", label: "Left" },
];
const RESULT_LABEL: Record<string, string> = { accepted: "Accepted", dropped: "Dropped", left: "Left" };
const RESULT_STYLE: Record<string, string> = {
  accepted: "bg-pz-surface-container-low text-pz-deep",
  dropped: "bg-pz-surface-container-low text-pz-danger",
  left: "bg-pz-surface-container-low text-pz-on-surface-variant",
};

/** Same columns for the header row and every decided row on a computer. */
const COLS = "md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_6rem_6.5rem_6rem_minmax(0,1.4fr)] md:items-center md:gap-4";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

/** The moment the decision was made: dropped, left or accepted time, falling back to when they applied. */
function decidedAt(r: AffiliateRow): string {
  if (r.status === "dropped") return r.droppedAt ?? r.createdAt;
  if (r.status === "left") return r.leftAt ?? r.createdAt;
  return r.acceptedAt ?? r.createdAt;
}

/**
 * Applications tab: three counts, the people waiting for a decision, then everyone already decided
 * (newest first) with a filter. Tapping any row opens the existing detail.
 */
export function AffiliateApplicationsTab({
  rows,
  onOpen,
  onClearOld,
}: {
  rows: AffiliateRow[];
  onOpen: (id: string) => void;
  onClearOld: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const waiting = useMemo(() => rows.filter((r) => r.status === "applied"), [rows]);
  const decided = useMemo(
    () => rows.filter((r) => r.status !== "applied").sort((a, b) => Date.parse(decidedAt(b)) - Date.parse(decidedAt(a))),
    [rows],
  );
  const shown = filter === "all" ? decided : decided.filter((r) => r.status === filter);
  const count = (s: AffiliateRow["status"]) => rows.filter((r) => r.status === s).length;

  const tiles = [
    { label: "Waiting", value: waiting.length },
    { label: "Accepted", value: count("accepted") },
    { label: "Dropped", value: count("dropped") },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <div data-testid="count-strip" className="grid grid-cols-3 gap-2 md:gap-5">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-2.5 md:p-5">
            <span className="block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant">{t.label}</span>
            <span className="mt-1 block font-headline text-xl font-extrabold text-pz-deep md:text-3xl">{t.value}</span>
          </div>
        ))}
      </div>

      <section aria-labelledby="applications-waiting" className="min-w-0 space-y-2">
        <h2 id="applications-waiting" className="font-headline text-sm font-bold uppercase tracking-wider text-pz-on-surface">Waiting</h2>
        {waiting.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-pz-outline-variant bg-pz-surface-container-lowest p-4 text-center md:p-10">
            <Inbox className="h-5 w-5 text-pz-on-surface-variant" aria-hidden="true" />
            <p className="font-body text-sm text-pz-on-surface-variant">No applications waiting. New ones show up here.</p>
          </div>
        ) : (
          <ul data-testid="waiting-list" className="w-full min-w-0 space-y-2">
            {waiting.map((r) => (
              <li key={r.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="w-full min-w-0 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 text-left"
                >
                  <span className="block break-words font-headline text-base font-bold text-pz-secondary">{r.name}</span>
                  <span className="mt-1 block break-words font-body text-sm text-pz-on-surface-variant">{r.email}</span>
                  <span className="mt-2 block font-body text-xs text-pz-on-surface-variant">Applied {when(r.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="applications-decided" className="min-w-0 space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 id="applications-decided" className="font-headline text-sm font-bold uppercase tracking-wider text-pz-on-surface">Decided</h2>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1.5 font-headline text-xs font-semibold max-md:min-h-11 max-md:px-4 ${
                  filter === f.key
                    ? "border-pz-solid-forest bg-pz-solid-forest text-white"
                    : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface-variant"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-pz-outline-variant p-4 text-center font-body text-sm text-pz-on-surface-variant">Nobody here yet.</p>
        ) : (
          <div className="min-w-0">
            <div aria-hidden="true" className={`hidden rounded-t-lg border border-pz-outline-variant bg-pz-surface-container-low px-4 py-3 font-headline text-xs font-bold uppercase tracking-wider text-pz-on-surface-variant ${COLS}`}>
              <span>Name</span>
              <span>Email</span>
              <span>Result</span>
              <span>Date</span>
              <span>Code</span>
              <span>Reason</span>
            </div>
            <ul data-testid="decided-list" className="w-full min-w-0 space-y-2 md:space-y-0 md:divide-y md:divide-pz-outline-variant md:rounded-b-lg md:border md:border-t-0 md:border-pz-outline-variant">
              {shown.map((r) => (
                <li key={r.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className={`w-full min-w-0 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3 text-left md:rounded-none md:border-0 md:px-4 md:py-3.5 ${COLS}`}
                  >
                    <span className="flex min-w-0 items-start justify-between gap-2 md:block">
                      <span className="min-w-0">
                        <span className="block break-words font-headline text-sm font-bold text-pz-secondary">{r.name}</span>
                        <span className="block break-words font-body text-xs text-pz-on-surface-variant md:hidden">{r.email}</span>
                      </span>
                      <span className={`inline-flex shrink-0 rounded px-2 py-0.5 font-headline text-xs font-semibold md:hidden ${RESULT_STYLE[r.status]}`}>{RESULT_LABEL[r.status]}</span>
                    </span>
                    <span className="hidden min-w-0 break-words font-body text-xs text-pz-on-surface-variant md:block">{r.email}</span>
                    <span className="hidden md:block">
                      <span className={`inline-flex rounded px-2 py-0.5 font-headline text-xs font-semibold ${RESULT_STYLE[r.status]}`}>{RESULT_LABEL[r.status]}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-pz-on-surface-variant md:mt-0 md:block">
                      <span>{when(decidedAt(r))}</span>
                      {r.status === "accepted" && r.code ? <span className="font-mono font-bold text-pz-on-surface md:hidden">{r.code}</span> : null}
                    </span>
                    <span className="hidden font-mono text-xs font-bold text-pz-on-surface md:block">{r.status === "accepted" ? r.code ?? "" : ""}</span>
                    {r.status === "dropped" ? (
                      <span className="mt-2 block min-w-0 break-words rounded bg-pz-surface-container-low p-2 font-body text-xs text-pz-on-surface-variant md:mt-0 md:bg-transparent md:p-0">
                        {r.dropReason?.trim() ? r.dropReason : "No reason recorded"}
                      </span>
                    ) : (
                      <span className="hidden md:block" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="py-2 text-center">
        <button type="button" onClick={onClearOld} className="font-body text-xs text-pz-on-surface-variant underline underline-offset-4 max-md:min-h-11">
          Clear old email history
        </button>
      </div>
    </div>
  );
}
