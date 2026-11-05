"use client";

import { Search } from "lucide-react";
import type { PortalAttendanceRow, PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";
import { inputClass } from "../ui";
import { boardMax } from "@/lib/progress/leaderboard";
import { BoardPicker, RankRow, gapLine } from "./Leaderboard";

interface Props {
  view: PortalBatchView;
  pick: string;
  onPick: (id: string) => void;
  rows: PortalResultRow[];
  term: string;
  onTerm: (v: string) => void;
  /** Every student the search matched (all students when the box is empty). */
  matches: PortalAttendanceRow[];
  highlight: string | null;
}

export function FindMe({ view, pick, onPick, rows, term, onTerm, matches, highlight }: Props) {
  const max = boardMax(view, pick);
  const byId = new Map(rows.map((r) => [r.pzId, r]));
  const searching = term.trim() !== "";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="relative min-w-0">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-pz-outline" />
        <input
          type="search"
          value={term}
          onChange={(e) => onTerm(e.target.value)}
          aria-label="Search by name or PZ ID"
          placeholder="Search by name or PZ ID"
          className={`${inputClass} pl-11`}
        />
      </div>
      <BoardPicker view={view} pick={pick} onPick={onPick} />
      <p role="status" aria-live="polite" className="-mt-2 text-sm text-pz-on-surface-variant">
        {searching ? `Showing ${matches.length} of ${view.attendance.length}` : "Type your name or PZ ID to find your place."}
      </p>
      {searching &&
        (matches.length === 0 ? (
          <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No one matches</p>
        ) : (
          <ul aria-label="Search results" className="flex min-w-0 flex-col gap-2.5">
            {matches.map((a) => {
              const res = byId.get(a.pzId);
              const recorded = a.mode === "recorded";
              const only = highlight === a.pzId;
              return (
                <RankRow
                  key={a.pzId}
                  row={{ name: a.name, pzId: a.pzId, mode: a.mode, score: res?.score ?? null, rank: res?.rank ?? null }}
                  max={max}
                  att={a}
                  highlight={only}
                  note={recorded ? "Recorded students are not ranked" : only && res ? gapLine(rows, a.pzId) : null}
                  noteMuted={recorded}
                />
              );
            })}
          </ul>
        ))}
    </div>
  );
}
