import Link from "next/link";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { formatDate, formatPkr } from "@/lib/format";
import type { StudentEnrollmentRow } from "@/lib/data/admin-students";

const STATUS_LABEL = new Map<string, string>([
  ["active", "Paid"],
  ["pending", "Pending"],
  ["reserved", "Pending"],
  ["rejected", "Rejected"],
  ["expired", "Expired"],
]);

export function enrollmentStatusLabel(status: string): string {
  const known = STATUS_LABEL.get(status);
  if (known) return known;
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
}

export function CoursesPayments({ enrollments }: { enrollments: StudentEnrollmentRow[] }) {
  if (enrollments.length === 0) return <EmptyState icon={BookOpen} title="No courses yet." />;
  return (
    <ul className="space-y-2">
      {enrollments.map((e) => {
        const label = enrollmentStatusLabel(e.status);
        return (
          <li
            key={e.id}
            className="flex flex-col gap-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="break-words font-headline text-base font-bold text-pz-on-surface">{e.courseTitle}</p>
              <p className="font-body text-xs text-pz-on-surface-variant">{formatDate(e.enrolledAt)} · {formatPkr(e.paymentAmountPkr) ?? "—"}</p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 font-body text-xs font-bold",
                  label === "Paid"
                    ? "bg-pz-primary-container text-pz-on-primary-container"
                    : "bg-pz-surface-container-high text-pz-on-surface",
                )}
              >
                {label}
              </span>
              <Link
                href={`/dashboard/admin/enrollments/${encodeURIComponent(e.id)}`}
                className="inline-flex min-h-11 items-center font-body text-sm font-bold text-pz-primary hover:underline"
              >
                Open enrollment
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
