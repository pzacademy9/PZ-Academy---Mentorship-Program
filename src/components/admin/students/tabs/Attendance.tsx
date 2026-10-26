import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { StudentAttendanceRow } from "@/lib/data/admin-students";

export function Attendance({ rows }: { rows: StudentAttendanceRow[] }) {
  if (rows.length === 0) return <EmptyState icon={CalendarCheck} title="No attendance recorded yet." />;
  return (
    <ul className="space-y-2">
      {rows.map((a) => (
        <li
          key={a.id}
          className="flex flex-col gap-1 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="break-words font-body text-sm font-semibold text-pz-on-surface">{a.courseTitle}</p>
          <p className="font-body text-sm text-pz-on-surface-variant">{formatDate(a.sessionDate)}</p>
        </li>
      ))}
    </ul>
  );
}
