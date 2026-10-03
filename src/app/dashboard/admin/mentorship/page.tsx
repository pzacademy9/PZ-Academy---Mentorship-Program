import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listBookingsForReview } from "@/lib/data/mentorship-bookings";
import { listApplicationsForReview } from "@/lib/data/mentorship-applications";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { MentorshipReviewActions } from "@/components/admin/mentorship/MentorshipReviewActions";
import { ScheduleSessionModal } from "@/components/admin/mentorship/ScheduleSessionModal";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { formatDate, relativeTime, initials } from "@/lib/format";

export const metadata = { title: "Mentorship Review — PZ Academy" };

function parseTab(value: string | undefined): "bookings" | "applications" {
  return value === "applications" ? "applications" : "bookings";
}

export default async function AdminMentorshipPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  const [bookings, applications] = await Promise.all([listBookingsForReview(), listApplicationsForReview()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Mentorship Review</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Manage session bookings and mentor applications.
        </p>
      </div>

      <ChipTabs label="Mentorship sections">
        <Link
          href="/dashboard/admin/mentorship?tab=bookings"
          aria-current={tab === "bookings" ? "page" : undefined}
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${tab === "bookings" ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          Bookings <span className="ml-2 tabular-nums">{bookings.length}</span>
        </Link>
        <Link
          href="/dashboard/admin/mentorship?tab=applications"
          aria-current={tab === "applications" ? "page" : undefined}
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${tab === "applications" ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          Applications <span className="ml-2 tabular-nums">{applications.length}</span>
        </Link>
      </ChipTabs>

      {tab === "bookings" ? (
        bookings.length === 0 ? (
          <EmptyState icon={Inbox} title="No bookings yet" description="Session bookings will appear here once students submit them." />
        ) : (
          <ResponsiveList
            rows={bookings}
            getKey={(b) => b.id}
            mobile={{
              title: (b) => b.fullName,
              meta: (b) => [
                b.email,
                `${b.mentorName} · ${b.packageName}`,
                `${formatDate(b.createdAt)} · ${relativeTime(b.createdAt)}`,
                <span key="status" className="inline-flex flex-wrap items-center gap-3">
                  <MentorshipStatusBadge kind="booking" status={b.status} />
                  {b.paymentScreenshotUrl && (
                    <a
                      href={b.paymentScreenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center font-body text-pz-primary text-xs font-bold hover:underline"
                    >
                      View receipt
                    </a>
                  )}
                </span>,
                <div key="actions" className="flex flex-wrap items-center gap-2 pt-1">
                  {b.status === "confirmed" && (
                    <ScheduleSessionModal
                      bookingId={b.id}
                      studentName={b.fullName}
                      mentorName={b.mentorName}
                      packageName={b.packageName}
                    />
                  )}
                  <MentorshipReviewActions kind="booking" id={b.id} status={b.status} name={b.fullName} />
                </div>,
              ],
            }}
            table={
          <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[48rem]">
                <thead>
                  <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                    <th className="py-4 px-6 font-headline font-semibold">Student</th>
                    <th className="py-4 px-6 font-headline font-semibold">Mentor</th>
                    <th className="py-4 px-6 font-headline font-semibold">Package</th>
                    <th className="py-4 px-6 font-headline font-semibold">Receipt</th>
                    <th className="py-4 px-6 font-headline font-semibold">Submitted</th>
                    <th className="py-4 px-6 font-headline font-semibold">Status</th>
                    <th className="py-4 px-6 font-headline font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-pz-surface-container/40 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                            {initials(b.fullName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-body font-medium truncate">{b.fullName}</span>
                            <span className="block font-body text-xs text-pz-on-surface-variant truncate">{b.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-body">{b.mentorName}</td>
                      <td className="py-4 px-6 font-body">{b.packageName}</td>
                      <td className="py-4 px-6">
                        {b.paymentScreenshotUrl ? (
                          <a
                            href={b.paymentScreenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-body text-pz-primary text-xs font-bold hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          <span className="font-body text-xs text-pz-on-surface-variant/60 dark:text-pz-on-surface-variant/80">—</span>
                        )}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="block font-body">{formatDate(b.createdAt)}</span>
                        <span className="block font-body text-[11px] font-semibold text-pz-on-surface-variant">{relativeTime(b.createdAt)}</span>
                      </td>
                      <td className="py-4 px-6">
                        <MentorshipStatusBadge kind="booking" status={b.status} />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-end items-center gap-2">
                          {b.status === "confirmed" && (
                            <ScheduleSessionModal
                              bookingId={b.id}
                              studentName={b.fullName}
                              mentorName={b.mentorName}
                              packageName={b.packageName}
                            />
                          )}
                          <MentorshipReviewActions kind="booking" id={b.id} status={b.status} name={b.fullName} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            }
          />
        )
      ) : applications.length === 0 ? (
        <EmptyState icon={Inbox} title="No applications yet" description="Mentor applications will appear here once they are submitted." />
      ) : (
        <ResponsiveList
          rows={applications}
          getKey={(a) => a.id}
          mobile={{
            title: (a) => a.fullName,
            meta: (a) => [
              a.email,
              `${a.profession ?? "—"} · ${a.yearsExperience ?? "—"}`,
              `${formatDate(a.createdAt)} · ${relativeTime(a.createdAt)}`,
              <span key="status" className="inline-flex flex-wrap items-center gap-x-3">
                <MentorshipStatusBadge kind="application" status={a.status} />
                {a.cvUrl && (
                  <a
                    href={a.cvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center font-body text-pz-primary text-xs font-bold hover:underline"
                  >
                    CV
                  </a>
                )}
                {a.photoUrls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center font-body text-pz-primary text-xs font-bold hover:underline"
                  >
                    {a.photoUrls.length > 1 ? `Photo ${i + 1}` : "Photo"}
                  </a>
                ))}
              </span>,
              <div key="actions" className="pt-1">
                <MentorshipReviewActions kind="application" id={a.id} status={a.status} name={a.fullName} />
              </div>,
            ],
          }}
          table={
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[48rem]">
              <thead>
                <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                  <th className="py-4 px-6 font-headline font-semibold">Applicant</th>
                  <th className="py-4 px-6 font-headline font-semibold">Profession</th>
                  <th className="py-4 px-6 font-headline font-semibold">Experience</th>
                  <th className="py-4 px-6 font-headline font-semibold">Documents</th>
                  <th className="py-4 px-6 font-headline font-semibold">Submitted</th>
                  <th className="py-4 px-6 font-headline font-semibold">Status</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                {applications.map((a) => (
                  <tr key={a.id} className="hover:bg-pz-surface-container/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                          {initials(a.fullName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-body font-medium truncate">{a.fullName}</span>
                          <span className="block font-body text-xs text-pz-on-surface-variant truncate">{a.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-body">{a.profession ?? "—"}</td>
                    <td className="py-4 px-6 font-body">{a.yearsExperience ?? "—"}</td>
                    <td className="py-4 px-6">
                      {a.cvUrl || a.photoUrls.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {a.cvUrl && (
                            <a
                              href={a.cvUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-body text-pz-primary text-xs font-bold hover:underline block"
                            >
                              CV
                            </a>
                          )}
                          {a.photoUrls.map((url, i) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-body text-pz-primary text-xs font-bold hover:underline block"
                            >
                              {a.photoUrls.length > 1 ? `Photo ${i + 1}` : "Photo"}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="font-body text-xs text-pz-on-surface-variant/60 dark:text-pz-on-surface-variant/80">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className="block font-body">{formatDate(a.createdAt)}</span>
                      <span className="block font-body text-[11px] font-semibold text-pz-on-surface-variant">{relativeTime(a.createdAt)}</span>
                    </td>
                    <td className="py-4 px-6">
                      <MentorshipStatusBadge kind="application" status={a.status} />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end">
                        <MentorshipReviewActions kind="application" id={a.id} status={a.status} name={a.fullName} />
                      </div>
                    </td>
                  </tr>
                ))}
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
