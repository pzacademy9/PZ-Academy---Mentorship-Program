import type { AttendanceRow, ResultRow } from "@/lib/progress/build";
import { formatPkt } from "@/lib/attendance/rules";
import { formatDatePkt } from "@/lib/format";

const num = (n: number) => `${String(n).padStart(2, "0")}.`;

const TAGS = {
  "check-in": { text: "Present (marked at check-in)", cls: "bg-pz-primary-container text-pz-on-primary-container" },
  admin: { text: "Present (marked by admin)", cls: "bg-pz-tertiary-container text-pz-on-tertiary-container" },
  absent: { text: "Absent", cls: "bg-pz-error-container text-pz-on-error-container" },
  upcoming: { text: "Upcoming", cls: "bg-pz-surface-container-highest text-pz-on-surface-variant" },
} as const;

function tagFor(row: AttendanceRow) {
  if (row.state === "present") return TAGS[row.how === "admin" ? "admin" : "check-in"];
  return TAGS[row.state];
}

export function SessionRow({ row }: { row: AttendanceRow }) {
  const tag = tagFor(row);
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-pz-surface-container-low p-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="break-words font-headline text-sm font-bold text-pz-on-surface">
          {num(row.number)} {row.title}
        </p>
        <p className="text-sm text-pz-on-surface-variant">{formatPkt(row.startsAt)}</p>
      </div>
      <span className={`max-w-full rounded px-2 py-1 font-headline text-xs font-bold ${tag.cls}`}>{tag.text}</span>
    </li>
  );
}

export function ResultRowItem({ row }: { row: ResultRow }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-pz-surface-container-low p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <p className="break-words font-headline text-sm font-bold text-pz-on-surface">
            {num(row.number)} {row.title}
          </p>
          <p className="text-sm text-pz-on-surface-variant">{formatDatePkt(row.startsAt)}</p>
        </div>
        <span className="font-headline text-base font-extrabold text-pz-primary">
          <span className="sr-only">Score: </span>
          {row.max === null ? row.score : `${row.score} / ${row.max}`}
        </span>
      </div>
      {row.rank !== null && row.of !== null && (
        <div className="flex border-t border-pz-surface-container-highest pt-1.5">
          <span className="rounded bg-pz-surface-container-lowest px-2 py-0.5 font-headline text-xs font-bold text-pz-on-surface">
            Rank {row.rank} of {row.of}
          </span>
        </div>
      )}
    </li>
  );
}
