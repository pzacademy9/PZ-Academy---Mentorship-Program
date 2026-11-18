"use client";

import Link from "next/link";
import type { CohortRow } from "@/lib/data/admin-crm-import";
import { formatDatePkt } from "@/lib/format";
import { CohortRowMenu } from "./CohortRowMenu";

const KIND_BADGE: Record<CohortRow["kind"], string | null> = {
  imported: null,
  closed_paid: "Closed batch: paid",
  closed_interested: "Interested, not paid",
};

function KindBadge({ kind }: { kind: CohortRow["kind"] }) {
  const text = KIND_BADGE[kind];
  if (!text) return null;
  return (
    <span className="inline-block rounded-full bg-pz-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase text-pz-on-primary-container">
      {text}
    </span>
  );
}

function peopleText(c: CohortRow) {
  return `${c.contactCount} ${c.contactCount === 1 ? "person" : "people"}`;
}
const showImportedNote = (c: CohortRow) => c.kind !== "closed_interested" && c.contactCount !== c.rowsImported;
const cohortHref = (c: CohortRow) => `/dashboard/admin/sales-hub/cohorts/${c.id}`;
const checkLabel = (c: CohortRow) => `Select ${c.sheetName}, ${c.tabName}`;

export function CohortsList({
  cohorts,
  selected,
  atLimit,
  busyId,
  removing,
  onToggle,
  onDelete,
}: {
  cohorts: CohortRow[];
  selected: string[];
  atLimit: boolean;
  busyId: string | null;
  removing: boolean;
  onToggle: (id: string) => void;
  onDelete: (c: CohortRow) => void;
}) {
  const isOn = (c: CohortRow) => selected.includes(c.id);
  const course = (c: CohortRow) => (
    <span className={c.courseTitle ? "" : "text-pz-on-surface-variant"}>{c.courseTitle ?? "Course not set"}</span>
  );
  const people = (c: CohortRow) => (
    <>
      <span>{peopleText(c)}</span>
      {showImportedNote(c) && <span className="text-pz-on-surface-variant"> (of {c.rowsImported} imported)</span>}
    </>
  );

  return (
    <>
      <ul data-testid="cohort-cards" className="space-y-2 md:hidden">
        {cohorts.map((c) => (
          <li key={c.id} className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest">
            <div className="flex items-start">
              <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-pz-primary"
                  aria-label={checkLabel(c)}
                  checked={isOn(c)}
                  disabled={atLimit && !isOn(c)}
                  onChange={() => onToggle(c.id)}
                />
              </label>
              <div className="min-w-0 flex-1 py-1 pr-3 font-body text-sm text-pz-on-surface">
                <Link href={cohortHref(c)} className="inline-flex min-h-11 items-center break-words font-medium underline [overflow-wrap:anywhere]">
                  {c.sheetName}
                </Link>
                <p className="break-words text-pz-on-surface-variant [overflow-wrap:anywhere]">{c.tabName}</p>
                <p className="break-words [overflow-wrap:anywhere]">{course(c)}</p>
                <p className="break-words">
                  {people(c)} · {formatDatePkt(c.createdAt)}
                </p>
                <div className="mt-1">
                  <KindBadge kind={c.kind} />
                </div>
              </div>
            </div>
            <div className="border-t border-pz-outline-variant px-2 py-1">
              <CohortRowMenu cohort={c} busy={removing && busyId === c.id} locked={removing} onDelete={onDelete} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <table className="w-full text-left font-body text-sm text-pz-on-surface">
          <thead className="text-xs uppercase text-pz-on-surface-variant">
            <tr>
              <th className="w-10 py-2"><span className="sr-only">Select</span></th>
              <th className="py-2">Cohort</th>
              <th className="py-2">Course</th>
              <th className="py-2">People</th>
              <th className="py-2">Imported</th>
              <th className="py-2"><span className="sr-only">More</span></th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.id} className="border-t border-pz-outline-variant align-top">
                <td className="py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-pz-primary"
                    aria-label={checkLabel(c)}
                    checked={isOn(c)}
                    disabled={atLimit && !isOn(c)}
                    onChange={() => onToggle(c.id)}
                  />
                </td>
                <td className="min-w-0 max-w-xs py-2 pr-3">
                  <Link href={cohortHref(c)} className="break-words font-medium underline">
                    {c.sheetName}
                  </Link>
                  <p className="break-words text-pz-on-surface-variant">{c.tabName}</p>
                  <KindBadge kind={c.kind} />
                </td>
                <td className="py-2 pr-3">{course(c)}</td>
                <td className="py-2 pr-3 tabular-nums">{people(c)}</td>
                <td className="py-2 pr-3">{formatDatePkt(c.createdAt)}</td>
                <td className="w-48 py-2">
                  <CohortRowMenu cohort={c} busy={removing && busyId === c.id} locked={removing} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
