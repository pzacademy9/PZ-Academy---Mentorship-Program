import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { StudentFeedbackRow } from "@/lib/data/admin-students";

export function Feedback({ rows }: { rows: StudentFeedbackRow[] }) {
  if (rows.length === 0) return <EmptyState icon={MessageSquare} title="No feedback yet." />;
  return (
    <ul className="space-y-2">
      {rows.map((f) => (
        <li
          key={f.id}
          className="space-y-1 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4"
        >
          <div className="flex items-center justify-between gap-3 font-body text-sm">
            <span className="text-pz-on-surface-variant">{formatDate(f.submittedAt)}</span>
            <span className="font-bold text-pz-on-surface">
              {f.rating === null ? "—" : `${Math.round(f.rating * 10) / 10} / 5`}
            </span>
          </div>
          {f.comments && (
            <p className="whitespace-pre-wrap break-words font-body text-sm text-pz-on-surface">{f.comments}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
