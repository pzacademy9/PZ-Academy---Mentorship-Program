import { GraduationCap } from "lucide-react";
import { initials } from "@/lib/format";
import type { MentorStudent } from "@/lib/data/mentorship-sessions";

export function MyStudentsList({ students }: { students: MentorStudent[] }) {
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <GraduationCap className="w-10 h-10 text-pz-border mb-3" />
        <p className="text-pz-muted text-sm">No active students yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {students.map((s) => (
        <div key={s.studentId} className="flex items-center gap-3">
          <span className="w-9 h-9 shrink-0 rounded-full bg-pz-lime/30 text-pz-forest grid place-items-center font-headline font-bold text-xs">
            {initials(s.studentName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-headline font-bold text-pz-forest text-sm truncate">{s.studentName}</p>
            <p className="font-body text-xs text-pz-muted">
              {s.completedCount} of {s.totalCount} sessions done
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
