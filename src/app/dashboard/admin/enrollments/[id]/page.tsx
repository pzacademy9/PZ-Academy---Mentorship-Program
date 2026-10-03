import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff, ExternalLink, Mail, Phone } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getEnrollmentForReview } from "@/lib/data/admin-enrollments";
import { EnrollmentStatusBadge } from "@/components/admin/EnrollmentStatusBadge";
import { EnrollmentReviewActions } from "@/components/admin/EnrollmentReviewActions";
import { SheetPendingBanner } from "@/components/admin/SheetPendingBanner";
import { formatDate, formatDateTime, relativeTime, formatPkr, initials } from "@/lib/format";

export const metadata = { title: "Enrollment Detail — PZ Academy" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-label text-[11px] uppercase tracking-widest text-pz-secondary/80">
        {label}
      </dt>
      <dd className="font-body text-sm text-pz-on-surface mt-0.5">{children}</dd>
    </div>
  );
}

export default async function AdminEnrollmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  const enrollment = await getEnrollmentForReview(id);
  if (!enrollment) notFound();

  const amount = formatPkr(enrollment.paymentAmountPkr);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/enrollments"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to review queue
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">
            {enrollment.student.fullName}
          </h1>
          <EnrollmentStatusBadge status={enrollment.status} />
        </div>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          {enrollment.course.title} · submitted {relativeTime(enrollment.enrolledAt)}
        </p>
      </div>

      {enrollment.sheetPendingStatus && (
        <SheetPendingBanner
          enrollmentId={enrollment.id}
          note={enrollment.sheetPendingNote ?? "The sheet requests a status change."}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-12 h-12 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-sm">
                {initials(enrollment.student.fullName)}
              </span>
              <div className="min-w-0">
                <p className="font-headline font-bold text-pz-on-surface truncate">
                  {enrollment.student.fullName}
                </p>
                <p className="font-body text-xs text-pz-on-surface-variant">Student</p>
              </div>
            </div>

            <dl className="space-y-4">
              <Field label="Email">
                {enrollment.student.email ? (
                  <a
                    href={`mailto:${enrollment.student.email}`}
                    className="inline-flex items-center gap-1.5 hover:text-pz-primary transition-colors break-all"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    {enrollment.student.email}
                  </a>
                ) : (
                  <span className="text-pz-on-surface-variant">Not available</span>
                )}
              </Field>

              <Field label="Phone">
                {enrollment.student.phone ? (
                  <a
                    href={`tel:${enrollment.student.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-pz-primary transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {enrollment.student.phone}
                  </a>
                ) : (
                  <span className="text-pz-on-surface-variant">Not provided</span>
                )}
              </Field>
            </dl>
          </section>

          <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
            <h2 className="font-headline font-bold text-pz-on-surface text-base mb-5">
              Enrollment
            </h2>
            <dl className="space-y-4">
              <Field label="Course">
                <Link
                  href={`/courses/${enrollment.course.slug}`}
                  className="hover:text-pz-primary transition-colors"
                >
                  {enrollment.course.title}
                </Link>
                <span className="block text-xs text-pz-on-surface-variant capitalize">
                  {enrollment.course.type}
                </span>
              </Field>

              <Field label="Declared amount">
                {amount ? (
                  <span className="font-headline font-semibold tabular-nums">{amount}</span>
                ) : (
                  <span className="italic text-pz-on-surface-variant/70 dark:text-pz-on-surface-variant/80">
                    Not stated by student
                  </span>
                )}
              </Field>

              <Field label="Submitted">
                {formatDate(enrollment.enrolledAt)}
                <span className="block text-xs text-pz-on-surface-variant">
                  {relativeTime(enrollment.enrolledAt)}
                </span>
              </Field>

              {enrollment.verifiedAt && (
                <Field label="Last reviewed">
                  {formatDateTime(enrollment.verifiedAt)}
                  <span className="block text-xs text-pz-on-surface-variant">
                    by {enrollment.verifiedByName ?? "an admin"}
                  </span>
                </Field>
              )}

              {enrollment.rejectionReason && (
                <Field label="Rejection reason">
                  <span className="block rounded-lg bg-pz-solid-danger/10 text-pz-danger px-3 py-2 text-sm">
                    {enrollment.rejectionReason}
                  </span>
                </Field>
              )}
            </dl>
          </section>
        </div>

        {/* Payment proof */}
        <div className="lg:col-span-3 space-y-6">
          <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-headline font-bold text-pz-on-surface text-base">
                Payment proof
              </h2>
              {enrollment.paymentScreenshotUrl && (
                <a
                  href={enrollment.paymentScreenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant hover:text-pz-primary transition-colors"
                >
                  Open in Drive <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {enrollment.hasScreenshot ? (
              <div className="rounded-xl overflow-hidden border border-pz-outline-variant/60 bg-pz-surface-container-lowest">
                {/* Streamed through our admin-gated proxy: the stored Drive URL is
                    an HTML viewer page and cannot be used as an image source. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/enrollments/${enrollment.id}/screenshot`}
                  alt={`Payment proof submitted by ${enrollment.student.fullName}`}
                  className="w-full max-h-[70vh] object-contain"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-pz-outline-variant p-10 flex flex-col items-center text-center">
                <ImageOff className="w-9 h-9 text-pz-outline-variant mb-3" />
                <p className="font-body text-sm text-pz-on-surface-variant">
                  No screenshot was submitted with this enrollment.
                </p>
                <p className="font-body text-xs text-pz-on-surface-variant/70 dark:text-pz-on-surface-variant/80 mt-1">
                  Confirm the payment another way before approving.
                </p>
              </div>
            )}
          </section>

          <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
            <h2 className="font-headline font-bold text-pz-on-surface text-base mb-1">Decision</h2>
            <p className="font-body text-sm text-pz-on-surface-variant mb-5">
              Approving unlocks the first lesson immediately and emails the student.
            </p>
            <EnrollmentReviewActions
              enrollmentId={enrollment.id}
              status={enrollment.status}
              studentName={enrollment.student.fullName}
              courseTitle={enrollment.course.title}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
