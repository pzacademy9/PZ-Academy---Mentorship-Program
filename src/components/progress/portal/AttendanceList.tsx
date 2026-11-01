"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, PlayCircle, TriangleAlert } from "lucide-react";
import { formatPkt } from "@/lib/attendance/rules";
import type { PortalAttendanceRow } from "@/lib/progress/portal-build";
import { btnFocus } from "../ui";

const CLASS_CHIP = {
  "check-in": { text: "Present (check-in)", cls: "bg-pz-primary-container text-pz-on-primary-container" },
  admin: { text: "Present (by admin)", cls: "bg-pz-tertiary-container text-pz-on-tertiary-container" },
  absent: { text: "Absent", cls: "bg-pz-error-container text-pz-on-error-container" },
  upcoming: { text: "Upcoming", cls: "bg-pz-surface-container-highest text-pz-on-surface-variant" },
} as const;

function Avatar({ name, recorded }: { name: string; recorded: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-headline text-lg font-black ${
        recorded ? "bg-pz-surface-container-highest text-pz-on-surface-variant" : "bg-pz-primary-container text-pz-on-primary-container"
      }`}
    >
      {(name.match(/[a-zÀ-￿]/i)?.[0] ?? "?").toUpperCase()}
    </span>
  );
}

function RowBody({ row, minPct }: { row: PortalAttendanceRow; minPct: number }) {
  const recorded = row.mode === "recorded";
  const noClasses = !recorded && (row.held ?? 0) === 0;
  const pct = row.pct ?? 0;
  return (
    <>
      <Avatar name={row.name} recorded={recorded} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-headline text-base font-bold text-pz-on-surface">{row.name}</span>
          <span className="rounded-md bg-pz-surface-container-high px-2 py-0.5 font-mono text-sm text-pz-on-surface-variant">{row.pzId}</span>
        </span>
        {recorded ? (
          <span className="block text-sm text-pz-on-surface-variant">Not tracked</span>
        ) : noClasses ? (
          <span className="block text-sm text-pz-on-surface-variant">No classes yet</span>
        ) : (
          <>
            <span className="block text-sm text-pz-on-surface-variant">
              Attended {row.attended} of {row.held} classes ({row.pct}%)
            </span>
            <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-pz-surface-container-highest">
              <span
                className={`block h-full rounded-full ${row.meetsMin ? "bg-pz-primary" : "bg-pz-tertiary"}`}
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </span>
            {row.meetsMin ? (
              <span className="flex w-fit items-center gap-1 rounded-full bg-pz-primary-container px-2.5 py-1 font-headline text-sm font-bold text-pz-on-primary-container">
                <CheckCircle2 aria-hidden className="h-4 w-4" />
                Meets {minPct}% target
              </span>
            ) : (
              <span className="flex w-fit items-center gap-1 rounded-full bg-pz-tertiary-container px-2.5 py-1 font-headline text-sm font-bold text-pz-on-tertiary-container">
                <TriangleAlert aria-hidden className="h-4 w-4" />
                Below {minPct}%
              </span>
            )}
          </>
        )}
        {recorded && (
          <span className="flex w-fit items-center gap-1 rounded-full bg-pz-surface-container-high px-2.5 py-1 font-headline text-sm font-bold text-pz-on-surface-variant">
            <PlayCircle aria-hidden className="h-4 w-4" />
            Recorded student
          </span>
        )}
      </span>
    </>
  );
}

function ClassList({ row }: { row: PortalAttendanceRow }) {
  return (
    <ul className="flex min-w-0 flex-col gap-2 px-3 pb-3">
      {row.classes.map((c) => {
        const chip = c.state === "present" ? CLASS_CHIP[c.how === "admin" ? "admin" : "check-in"] : CLASS_CHIP[c.state];
        return (
          <li
            key={c.number}
            className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg bg-pz-surface-container-low p-3"
          >
            <div className="min-w-0 flex-1 basis-40">
              <p className="break-words font-headline text-sm font-bold text-pz-on-surface">
                Class {c.number} - {c.title}
              </p>
              <p className="text-sm text-pz-on-surface-variant">{formatPkt(c.startsAt)}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 font-headline text-sm font-bold ${chip.cls}`}>{chip.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function LiveRow({ row, minPct, open, onToggle }: { row: PortalAttendanceRow; minPct: number; open: boolean; onToggle: () => void }) {
  const panelId = `classes-${row.pzId}`;
  const canOpen = row.classes.length > 0;
  return (
    <div className="min-w-0 rounded-xl bg-pz-surface-container-lowest shadow-sm ring-1 ring-pz-outline-variant/40">
      {canOpen ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex min-h-11 w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left ${btnFocus}`}
        >
          <RowBody row={row} minPct={minPct} />
          <ChevronDown
            aria-hidden
            className={`mt-3 h-5 w-5 shrink-0 text-pz-outline transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex min-w-0 items-start gap-3 p-3">
          <RowBody row={row} minPct={minPct} />
        </div>
      )}
      {canOpen && open && (
        <div id={panelId} className="border-t border-pz-outline-variant/40 pt-3">
          <p className="px-3 pb-2 font-headline text-sm font-bold text-pz-on-surface-variant">Class by class</p>
          <ClassList row={row} />
        </div>
      )}
    </div>
  );
}

export function AttendanceList({ rows, minPct }: { rows: PortalAttendanceRow[]; minPct: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="flex min-w-0 flex-col gap-3">
      {rows.map((row) => (
        <li key={row.pzId} className="min-w-0">
          {row.mode === "recorded" ? (
            <div className="flex min-w-0 items-start gap-3 rounded-xl bg-pz-surface-container-lowest p-3 shadow-sm ring-1 ring-pz-outline-variant/40">
              <RowBody row={row} minPct={minPct} />
            </div>
          ) : (
            <LiveRow row={row} minPct={minPct} open={openId === row.pzId} onToggle={() => setOpenId(openId === row.pzId ? null : row.pzId)} />
          )}
        </li>
      ))}
    </ul>
  );
}
