import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ENROLLMENT_STATUSES,
  type StatusFilter,
} from "@/lib/data/admin-enrollments";
import { ENROLLMENT_STATUS_LABELS } from "./EnrollmentStatusBadge";

/**
 * Status filter pills, mirroring the /courses catalog pill treatment.
 *
 * Plain links rather than a client component: the page is server-rendered off
 * the ?status= param anyway, so routing through Link keeps this zero-JS and
 * leaves the filter shareable and back-button friendly.
 */
export function EnrollmentFilterTabs({
  active,
  counts,
  courseId,
  courseTitle,
}: {
  active: StatusFilter;
  counts: Record<StatusFilter, number>;
  courseId?: string;
  courseTitle?: string;
}) {
  const tabs: StatusFilter[] = [...ENROLLMENT_STATUSES, "all"];
  const courseParams = courseId
    ? `&courseId=${encodeURIComponent(courseId)}${courseTitle ? `&courseTitle=${encodeURIComponent(courseTitle)}` : ""}`
    : "";

  return (
    <div className="flex gap-2 flex-wrap">
      {tabs.map((tab) => {
        const selected = tab === active;
        return (
          <Link
            key={tab}
            href={`/dashboard/admin/enrollments?status=${tab}${courseParams}`}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "px-5 py-2 rounded-full font-headline text-sm transition-all",
              selected
                ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
                : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium",
            )}
          >
            {tab === "all" ? "All" : ENROLLMENT_STATUS_LABELS[tab]}
            <span className={cn("ml-2 tabular-nums", !selected && "text-pz-on-surface-variant/60")}>
              {counts[tab]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
