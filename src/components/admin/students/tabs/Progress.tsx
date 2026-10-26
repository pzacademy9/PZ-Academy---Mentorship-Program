import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { StudentProgressRow } from "@/lib/data/admin-students";

export function Progress({ rows }: { rows: StudentProgressRow[] }) {
  if (rows.length === 0) return <EmptyState icon={TrendingUp} title="No progress yet." />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const value = Math.max(0, Math.min(100, Math.round(r.percent)));
        return (
          <li
            key={r.courseId}
            className="space-y-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="break-words font-headline text-base font-bold text-pz-on-surface">{r.courseTitle}</p>
              <p className="font-body text-sm text-pz-on-surface-variant">
                {r.completedLessons} of {r.totalLessons} lessons
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
                aria-label={`Progress in ${r.courseTitle}`}
                className="h-2 flex-1 overflow-hidden rounded-full bg-pz-surface-container-high"
              >
                <div className="h-full rounded-full bg-pz-primary" style={{ width: `${value}%` }} />
              </div>
              <span className="font-body text-xs font-semibold text-pz-on-surface">{value}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
