"use client";

import type { PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";
import { btnFocus } from "../ui";

/** Max score shown next to an overall total: only when every class that has results has a known max. */
function overallMax(view: PortalBatchView): number | null {
  const withResults = view.sessions.filter((s) => (view.perClass[s.id] ?? []).length > 0);
  if (withResults.length === 0 || withResults.some((s) => s.quizMax === null)) return null;
  return withResults.reduce((n, s) => n + (s.quizMax ?? 0), 0);
}

/** The rows the board would show before searching: the parent needs them for the count. */
export function resultRowsFor(view: PortalBatchView, pick: string): PortalResultRow[] {
  return pick === "overall" ? view.overall : (view.perClass[pick] ?? []);
}

interface Props {
  view: PortalBatchView;
  pick: string;
  onPick: (id: string) => void;
  /** Rows after the shared search was applied. */
  rows: PortalResultRow[];
  /** Rows for this switch before searching. */
  totalRows: number;
}

export function ResultsBoard({ view, pick, onPick, rows, totalRows }: Props) {
  const max = pick === "overall" ? overallMax(view) : (view.sessions.find((s) => s.id === pick)?.quizMax ?? null);
  const options = [{ id: "overall", label: "Overall" }, ...view.sessions.map((s) => ({ id: s.id, label: `Class ${s.number}` }))];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div role="group" aria-label="Show results for" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={pick === o.id}
            onClick={() => onPick(o.id)}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 font-headline text-sm font-bold transition-colors motion-reduce:transition-none ${btnFocus} ${
              pick === o.id ? "bg-pz-primary text-pz-on-primary" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {totalRows === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No results yet</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No one matches</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.pzId}
              className="flex min-w-0 items-center gap-3 rounded-xl bg-pz-surface-container-lowest p-3 shadow-sm ring-1 ring-pz-outline-variant/40"
            >
              {r.rank !== null && (
                <span
                  aria-label={`Rank ${r.rank}`}
                  className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-pz-primary-container px-2 font-headline text-sm font-black text-pz-on-primary-container"
                >
                  {r.rank}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-words font-headline text-base font-bold text-pz-on-surface">{r.firstName}</span>
                <span className="rounded-md bg-pz-surface-container-high px-2 py-0.5 font-mono text-sm text-pz-on-surface-variant">{r.pzId}</span>
                {r.mode === "recorded" && (
                  <span className="rounded-full bg-pz-surface-container-high px-2.5 py-0.5 font-headline text-sm font-bold text-pz-on-surface-variant">
                    Recorded
                  </span>
                )}
              </div>
              <span className="shrink-0 text-right font-headline text-lg font-black text-pz-on-surface">
                {r.score}
                {max !== null && <span className="text-sm font-semibold text-pz-on-surface-variant"> of {max}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
