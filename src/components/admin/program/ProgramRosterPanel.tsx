import Link from "next/link";
import { Users, Download } from "lucide-react";

type Counts = { total: number; active: number; pending: number; rejected: number; expired: number };

const ROWS: { key: keyof Omit<Counts, "total">; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending Approval" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
];

/**
 * Deliberately thin — the plan calls for linking to the existing enrollments
 * admin rather than rebuilding its review UI (approve/reject/reserve) here.
 * This panel is the summary + the door to that screen, pre-filtered to this
 * course.
 */
export function ProgramRosterPanel({
  courseId,
  courseTitle,
  counts,
}: {
  courseId: string;
  courseTitle: string;
  counts: Counts;
}) {
  const filterParams = `courseId=${encodeURIComponent(courseId)}&courseTitle=${encodeURIComponent(courseTitle)}`;

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-pz-outline-variant bg-pz-surface-container-low">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface flex items-center gap-2">
          <Users className="w-5 h-5 text-pz-primary" />
          Student Roster
        </h3>
      </div>

      <div className="flex-grow p-4 space-y-2">
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between px-4 py-3 rounded-lg bg-pz-surface border border-pz-outline-variant/30"
          >
            <span className="font-body text-sm text-pz-on-surface-variant">{row.label}</span>
            <span className="font-headline font-bold text-sm text-pz-on-surface tabular-nums">
              {counts[row.key]}
            </span>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-pz-outline-variant space-y-2">
        <Link
          href={`/dashboard/admin/enrollments?status=pending&${filterParams}`}
          className="block w-full text-center py-2.5 bg-pz-primary text-pz-on-primary font-headline font-bold text-sm rounded-lg hover:opacity-90 transition-opacity"
        >
          Review & Manage Enrollments
        </Link>
        <Link
          href={`/dashboard/admin/enrollments?status=all&${filterParams}`}
          className="flex items-center justify-center gap-2 w-full text-center py-2.5 border border-pz-outline-variant text-pz-on-surface-variant font-headline font-bold text-sm rounded-lg hover:bg-pz-surface-container-low transition-colors"
        >
          <Download className="w-4 h-4" />
          View Full Roster
        </Link>
      </div>
    </div>
  );
}
