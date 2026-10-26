import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { StudentMentorshipRow } from "@/lib/data/admin-students";

export function Mentorship({ rows }: { rows: StudentMentorshipRow[] }) {
  if (rows.length === 0) return <EmptyState icon={Users} title="No mentorship bookings yet." />;
  return (
    <ul className="space-y-2">
      {rows.map((m) => (
        <li
          key={m.id}
          className="flex flex-col gap-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <p className="break-words font-headline text-base font-bold text-pz-on-surface">{m.mentorName}</p>
            <p className="break-words font-body text-sm text-pz-on-surface-variant">{m.packageName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-body text-sm text-pz-on-surface-variant">
            <span className="rounded-full bg-pz-surface-container-high px-2.5 py-0.5 text-xs font-bold text-pz-on-surface">
              {m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : "Unknown"}
            </span>
            <span>{m.sessionsTotal === null ? "Sessions not set" : `${m.sessionsTotal} ${m.sessionsTotal === 1 ? "session" : "sessions"}`}</span>
            <span>{formatDate(m.createdAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
