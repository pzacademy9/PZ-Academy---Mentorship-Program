import Link from "next/link";
import { Inbox, ImageOff } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import {
  listEnrollmentsForReview,
  countEnrollmentsByStatus,
  countApprovedThisMonth,
  ENROLLMENT_STATUSES,
  type StatusFilter,
} from "@/lib/data/admin-enrollments";
import { EnrollmentStatusBadge } from "@/components/admin/EnrollmentStatusBadge";
import { EnrollmentFilterTabs } from "@/components/admin/EnrollmentFilterTabs";
import { EnrollmentReviewActions } from "@/components/admin/EnrollmentReviewActions";
import { EnrollmentStatCards } from "@/components/admin/EnrollmentStatCards";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { formatDate, relativeTime, formatPkr, initials } from "@/lib/format";

export const metadata = { title: "Enrollment Review — PZ Academy" };

function parseFilter(value: string | undefined): StatusFilter {
  if (value === "all") return "all";
  return (ENROLLMENT_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as StatusFilter)
    : "pending";
}

export default async function AdminEnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; courseId?: string; courseTitle?: string }>;
}) {
  // Duplicates the middleware role gate on purpose — the codebase's
  // defence-in-depth convention for every admin page.
  await requireAdminPage();

  const { status, courseId, courseTitle } = await searchParams;
  const filter = parseFilter(status);

  const [enrollments, counts, approvedThisMonth] = await Promise.all([
    listEnrollmentsForReview(filter, courseId),
    countEnrollmentsByStatus(courseId),
    countApprovedThisMonth(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Enrollment Review</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Verify payment submissions and approve course access.
        </p>
      </div>

      {courseId && (
        <div className="flex items-center gap-2 bg-pz-primary-container/20 border border-pz-primary-container rounded-lg px-4 py-2.5 text-sm">
          <span className="font-body text-pz-on-surface">
            Showing only <span className="font-bold">{courseTitle ?? "this program"}</span>
          </span>
          <Link
            href={`/dashboard/admin/enrollments${status ? `?status=${status}` : ""}`}
            className="font-body font-semibold text-pz-primary hover:underline ml-auto"
          >
            Clear filter
          </Link>
        </div>
      )}

      <EnrollmentStatCards
        counts={{
          pending: counts.pending,
          approvedThisMonth,
          reserved: counts.reserved,
          rejected: counts.rejected,
        }}
      />

      <EnrollmentFilterTabs active={filter} counts={counts} courseId={courseId} courseTitle={courseTitle} />

      <h2 className="font-headline font-bold text-lg text-pz-on-surface">Manage Applications</h2>

      {enrollments.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === "pending" ? "Nothing awaiting review" : `No ${filter === "all" ? "" : filter + " "}enrollments to show`}
          description={filter === "pending" ? "New payment submissions will appear here." : undefined}
        />
      ) : (
        <ResponsiveList
          rows={enrollments}
          getKey={(e) => e.id}
          mobile={{
            title: (e) => (
              <Link href={`/dashboard/admin/enrollments/${e.id}`} className="inline-flex min-h-11 items-center hover:text-pz-primary transition-colors">
                {e.student.fullName}
              </Link>
            ),
            meta: (e) => [
              e.student.email ?? e.student.phone ?? "—",
              `${e.course.title} (${e.course.type})`,
              `${formatDate(e.enrolledAt)} · ${formatPkr(e.paymentAmountPkr) ?? "Amount not stated"}`,
              <span key="status" className="inline-flex flex-wrap items-center gap-2">
                <EnrollmentStatusBadge status={e.status} />
                {e.paymentShortfallPkr != null && (
                  <span className="font-body text-[11px] font-semibold text-pz-gold">
                    Rs. {e.paymentShortfallPkr.toLocaleString("en-GB")} short
                  </span>
                )}
                {e.sheetPendingStatus && (
                  <span className="font-body text-[11px] font-semibold text-pz-danger">Sheet: → {e.sheetPendingStatus}</span>
                )}
              </span>,
              <div key="actions" className="pt-1">
                <EnrollmentReviewActions
                  enrollmentId={e.id}
                  status={e.status}
                  studentName={e.student.fullName}
                  courseTitle={e.course.title}
                  size="compact"
                />
              </div>,
            ],
          }}
          table={
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[52rem]">
              <thead>
                <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                  <th className="py-4 px-6 font-headline font-semibold">Student</th>
                  <th className="py-4 px-6 font-headline font-semibold">Course</th>
                  <th className="py-4 px-6 font-headline font-semibold">Submitted</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Amount</th>
                  <th className="py-4 px-6 font-headline font-semibold text-center">Receipt</th>
                  <th className="py-4 px-6 font-headline font-semibold">Status</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                {enrollments.map((enrollment) => {
                  const amount = formatPkr(enrollment.paymentAmountPkr);
                  return (
                    <tr
                      key={enrollment.id}
                      className="hover:bg-pz-surface-container/40 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <Link
                          href={`/dashboard/admin/enrollments/${enrollment.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                            {initials(enrollment.student.fullName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-body font-medium text-pz-on-surface truncate group-hover:text-pz-primary transition-colors">
                              {enrollment.student.fullName}
                            </span>
                            <span className="block font-body text-xs text-pz-on-surface-variant truncate">
                              {enrollment.student.email ?? enrollment.student.phone ?? "—"}
                            </span>
                          </span>
                        </Link>
                      </td>

                      <td className="py-4 px-6">
                        <span className="block font-body font-medium">
                          {enrollment.course.title}
                        </span>
                        <span className="inline-block px-2 py-0.5 mt-1 bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant text-[10px] rounded uppercase font-bold tracking-tight">
                          {enrollment.course.type}
                        </span>
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="block font-body">{formatDate(enrollment.enrolledAt)}</span>
                        <span className="block font-body text-[11px] font-semibold text-pz-on-surface-variant">
                          {relativeTime(enrollment.enrolledAt)}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        {amount ? (
                          <span className="font-headline font-bold tabular-nums">{amount}</span>
                        ) : (
                          <span className="font-body italic text-pz-on-surface-variant/70">
                            Not stated
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex justify-center">
                          {enrollment.hasScreenshot ? (
                            <Link
                              href={`/dashboard/admin/enrollments/${enrollment.id}`}
                              title="View full receipt"
                              className="block w-10 h-10 rounded-lg overflow-hidden bg-pz-surface-variant border border-pz-outline-variant cursor-zoom-in hover:border-pz-primary transition-colors"
                            >
                              {/* Same-origin proxy route, not an optimisable remote asset —
                                  next/image would fetch it without the admin's cookies. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/admin/enrollments/${enrollment.id}/screenshot`}
                                alt={`Payment receipt from ${enrollment.student.fullName}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </Link>
                          ) : (
                            <span
                              title="No receipt submitted"
                              className="w-10 h-10 rounded-lg grid place-items-center bg-pz-surface-variant border border-pz-outline-variant text-pz-on-surface-variant/60"
                            >
                              <ImageOff className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <EnrollmentStatusBadge status={enrollment.status} />
                        {enrollment.paymentShortfallPkr != null && (
                          <span className="block mt-1 font-body text-[11px] font-semibold text-pz-gold">
                            Rs. {enrollment.paymentShortfallPkr.toLocaleString("en-GB")} short
                          </span>
                        )}
                        {enrollment.sheetPendingStatus && (
                          <span className="block mt-1 font-body text-[11px] font-semibold text-pz-danger">
                            Sheet: → {enrollment.sheetPendingStatus}
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex justify-end">
                          <EnrollmentReviewActions
                            enrollmentId={enrollment.id}
                            status={enrollment.status}
                            studentName={enrollment.student.fullName}
                            courseTitle={enrollment.course.title}
                            size="compact"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
          }
        />
      )}
    </div>
  );
}
